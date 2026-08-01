// notify-training-change — voláme z admin UI po uložení zmeny tréningu.
// Serverovo overí admin rolu (bearer JWT) a rozpošle push + email rodičom
// jazdcov v skupine (aj druhým rodičom cez rider_parents).
// Payload:
//   { training_id: uuid, changes: [{ kind: "cancelled"|"time"|"coach"|"date", body?: string }] }
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPush } from "../_shared/push.ts";
import { sendEmail, trainingChangeEmail } from "../_shared/emails.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TITLES: Record<string, string> = {
  cancelled: "Tréning zrušený",
  time: "Zmena času tréningu",
  coach: "Zmena trénera",
  date: "Zmena termínu tréningu",
  location: "Zmena miesta tréningu",
  restored: "Tréning sa uskutoční",
  deleted: "Tréning odstránený z rozvrhu",
};

// Pomenovanie zmien pre súhrnnú správu, keď sa naraz zmenilo viac vecí.
const LABELS: Record<string, string> = {
  date: "termín",
  time: "čas",
  location: "miesto",
  coach: "tréner",
};

function fmtDate(d: string) {
  // yyyy-mm-dd → dd.mm.yyyy
  const [y, m, dd] = d.split("-");
  return `${dd}.${m}.${y}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Interní volajúci (cron / service-role) môžu obísť admin JWT kontrolu.
  const cronOk = req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET");
  const svcOk = req.headers.get("Authorization") === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!cronOk && !svcOk) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

      const anon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData, error: cErr } = await anon.auth.getUser();
      if (cErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json();
    const trainingId = body.training_id as string;
    const changes = (body.changes ?? []) as { kind: string; body?: string }[];
    if (!trainingId || changes.length === 0) return json({ error: "Missing training_id or changes" }, 400);

    const { data: s, error: sErr } = await admin
      .from("training_sessions")
      .select("id, group_id, session_date, start_time, end_time, location, coach_name, groups(name)")
      .eq("id", trainingId).single();
    if (sErr || !s) return json({ error: "Training not found" }, 404);

    // Rodičia jazdcov v skupine — hlavní z riders, plus druhí z rider_parents.
    const { data: rs } = await admin
      .from("riders").select("id, parent_user_id")
      .eq("group_id", (s as any).group_id)
      .eq("is_active", true);
    const riderIds = (rs ?? []).map((r: any) => r.id);
    const primaryIds = (rs ?? []).map((r: any) => r.parent_user_id).filter(Boolean);
    let secondaryIds: string[] = [];
    if (riderIds.length > 0) {
      const { data: rp } = await admin
        .from("rider_parents").select("parent_user_id")
        .in("rider_id", riderIds);
      secondaryIds = (rp ?? []).map((r: any) => r.parent_user_id).filter(Boolean);
    }
    const parentIds = Array.from(new Set([...primaryIds, ...secondaryIds]));
    if (parentIds.length === 0) return json({ sent: 0, message: "No parents" });

    // Emaily rodičov
    const { data: profs } = await admin
      .from("profiles").select("id, email").in("id", parentIds);
    const emailByUser = new Map<string, string>();
    for (const p of profs ?? []) if ((p as any).email) emailByUser.set((p as any).id, (p as any).email);

    // Klubové nastavenia pre branding emailu
    const { data: settings } = await admin
      .from("payment_settings").select("*").eq("id", 1).maybeSingle();

    const groupName = (s as any).groups?.name || "";
    const dateStr = fmtDate((s as any).session_date);
    const time = ((s as any).start_time || "").slice(0, 5);
    const endTime = ((s as any).end_time || "").slice(0, 5);
    const timeRange = endTime ? `${time}–${endTime}` : time;
    const coach = (s as any).coach_name || "";
    const location = (s as any).location || "";

    // Aktuálny stav tréningu — priložíme ku každej správe, nech rodič vidí platné údaje.
    const detailParts = [`${dateStr} o ${timeRange}`];
    if (location) detailParts.push(`miesto: ${location}`);
    if (coach) detailParts.push(`tréner: ${coach}`);
    const details = detailParts.join(", ");

    // Jedna správa za celé uloženie. Keď admin zmení naraz čas aj miesto,
    // rodič dostane jeden email so súhrnom, nie jeden za každú zmenu.
    const kinds = changes.map((c) => c.kind);
    const custom = changes.find((c) => c.body)?.body;
    let title: string;
    let msg: string;

    if (custom) {
      title = TITLES[kinds[0]] || "Zmena tréningu";
      msg = custom;
    } else if (kinds.includes("cancelled")) {
      title = TITLES.cancelled;
      msg = `Tréning ${groupName} ${dateStr} o ${timeRange} je zrušený.`;
    } else if (kinds.includes("deleted")) {
      title = TITLES.deleted;
      msg = `Tréning ${groupName} ${dateStr} o ${timeRange} bol odstránený z rozvrhu.`;
    } else if (kinds.includes("restored")) {
      title = TITLES.restored;
      msg = `Tréning ${groupName} sa uskutoční — ${details}.`;
    } else if (kinds.length === 1) {
      const k = kinds[0];
      title = TITLES[k] || "Zmena tréningu";
      if (k === "date") msg = `Tréning ${groupName} bol presunutý na ${details}.`;
      else if (k === "time") msg = `Tréning ${groupName} má nový čas — ${details}.`;
      else if (k === "location") {
        msg = location
          ? `Tréning ${groupName} ${dateStr} o ${timeRange} bude na novom mieste: ${location}.`
          : `Tréning ${groupName} ${dateStr} o ${timeRange} už nemá uvedené miesto konania.`;
      }
      else if (k === "coach") msg = `Tréning ${groupName} ${dateStr} o ${timeRange} povedie ${coach || "—"}.`;
      else msg = `Zmena v tréningu ${groupName} — ${details}.`;
    } else {
      title = "Zmena tréningu";
      const what = kinds.map((k) => LABELS[k] ?? k).join(", ");
      msg = `Tréning ${groupName}: zmenil sa ${what}. Aktuálne: ${details}.`;
    }

    await sendPush({
      userIds: parentIds,
      title,
      body: msg,
      tag: `training-${trainingId}`,
      url: "/",
    });

    // Email — pošli všetkým rodičom s emailom (sendEmail no-op ak chýba BREVO_API_KEY)
    const html = trainingChangeEmail({ settings, title, message: msg });
    const subj = `${title} — ${(settings as any)?.club_name ?? "CTVZ"}`;
    let emailSent = 0;
    await Promise.all(
      parentIds.map(async (uid) => {
        const em = emailByUser.get(uid);
        if (!em) return;
        try { await sendEmail(em, subj, html); emailSent += 1; } catch (e) { console.warn("email err", e); }
      }),
    );

    return json({ push: parentIds.length, emails: emailSent, parents: parentIds.length, changes: changes.length });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
