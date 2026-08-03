// deno-lint-ignore-file no-explicit-any
// request-password-reset — verejný endpoint pre "Zabudnuté heslo?".
//
// Prečo vlastná funkcia namiesto supabase.auth.resetPasswordForEmail():
//   • email odchádza cez Brevo z klubovej adresy v CTVZ brandingu,
//     nie cez vstavaný Supabase mailer (prísny rate limit, cudzí odosielateľ),
//   • cieľová adresa odkazu sa berie zo serverovej premennej APP_URL —
//     klient ju NEPOSIELA, takže sa nedá zneužiť na presmerovanie
//     s platným recovery tokenom na cudziu doménu (open redirect),
//   • vlastný rate limit na email aj IP.
//
// Endpoint zásadne neprezradí, či daný email v systéme existuje:
// vždy vráti { ok: true } a beží aspoň MIN_MS, aby sa účty nedali
// zisťovať ani podľa času odpovede.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail, passwordResetEmail } from "../_shared/emails.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PER_EMAIL_HOUR = 3;
const MAX_PER_IP_HOUR = 10;
const MIN_MS = 700; // spodná hranica trvania odpovede

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const startedAt = Date.now();
  // Odpoveď je vždy rovnaká — nech sa stane čokoľvek.
  const respond = async () => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_MS) await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
    return json({ ok: true });
  };

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    // Jednoduchá kontrola tvaru; podrobnejšiu robí až GoTrue.
    if (!email || email.length > 254 || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
      return await respond();
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const emailHash = await sha256Hex(email);
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const ipHash = ip ? await sha256Hex(ip) : null;
    const sinceHour = new Date(Date.now() - 3_600_000).toISOString();

    // ── Rate limit ──
    const { count: perEmail } = await admin
      .from("password_reset_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email_hash", emailHash)
      .gte("created_at", sinceHour);
    if ((perEmail ?? 0) >= MAX_PER_EMAIL_HOUR) return await respond();

    if (ipHash) {
      const { count: perIp } = await admin
        .from("password_reset_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", sinceHour);
      if ((perIp ?? 0) >= MAX_PER_IP_HOUR) return await respond();
    }

    await admin.from("password_reset_attempts").insert({ email_hash: emailHash, ip_hash: ipHash });
    // Upratanie starých záznamov — tabuľka slúži len ako krátkodobé počítadlo.
    await admin
      .from("password_reset_attempts")
      .delete()
      .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());

    // ── Recovery odkaz ──
    // Cieľ odkazu je serverová premenná; klient naň nemá žiadny vplyv.
    // SITE_URL už projekt používa (Stripe checkout, platby), APP_URL je
    // voliteľné prepísanie, keby mala appka bežať na inej adrese.
    const appUrl = (Deno.env.get("APP_URL") ?? Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
    if (!appUrl) {
      console.error("Nie je nastavené APP_URL ani SITE_URL — recovery odkaz sa neodoslal.");
      return await respond();
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${appUrl}/reset-password` },
    });
    // Neexistujúci účet: mlčky končíme, navonok nerozoznateľné od úspechu.
    if (linkErr || !linkData?.properties) return await respond();

    // Odkaz staviame na vlastnú doménu a token overíme sami cez verifyOtp.
    // Hotový action_link vedie cez /auth/v1/verify, ktorý cieľ presmerovania
    // porovnáva s allow-listom v Auth nastaveniach — ak tam nie je, používateľa
    // to vyhodí na Site URL, teda na prihlásenie. Takto na tom nezávisíme.
    const props = linkData.properties as { hashed_token?: string; action_link?: string };
    const link = props.hashed_token
      ? `${appUrl}/reset-password?token_hash=${encodeURIComponent(props.hashed_token)}&type=recovery`
      : props.action_link;
    if (!link) return await respond();

    const { data: settings } = await admin
      .from("payment_settings").select("*").eq("id", 1).maybeSingle();

    const html = passwordResetEmail({ settings, link });
    const subj = `Obnovenie hesla — ${(settings as any)?.club_name ?? "CTVZ"}`;
    try {
      await sendEmail(email, subj, html);
    } catch (e) {
      console.error("reset email err", e);
    }

    return await respond();
  } catch (e) {
    console.error("request-password-reset", e);
    return await respond();
  }
});
