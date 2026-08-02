// register-rider — admin akcie: registrácia jazdca (a jeho rodičov),
// zmena emailu, prilinkovanie/odlinkovanie druhého rodiča.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const fullNameOf = (first?: string | null, last?: string | null, fallback?: string | null) => {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const joined = [f, l].filter(Boolean).join(" ");
  return joined || (fallback ?? "").trim();
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Admin autentifikácia
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return j({ error: "Neautorizované" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) return j({ error: "Neplatný token" }, 401);

    const { data: roleData } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleData) return j({ error: "Nemáte oprávnenie" }, 403);

    const body = await req.json();
    const action = body.action as string | undefined;

    // ── Zmena emailu rodiča ────────────────────────────────────────────
    if (action === "update_email") {
      const { parent_user_id, email } = body;
      if (!parent_user_id || !email) return j({ error: "Chýbajú údaje" }, 400);
      const { error: authError } = await admin.auth.admin.updateUserById(parent_user_id, { email });
      if (authError) return j({ error: authError.message }, 500);
      await admin.from("profiles").update({ email }).eq("id", parent_user_id);
      return j({ success: true });
    }

    // ── Zmena mena rodiča (profiles.full_name + auth user_metadata) ────
    if (action === "update_parent_name") {
      const { parent_user_id, full_name } = body;
      const name = (full_name ?? "").trim();
      if (!parent_user_id || !name) return j({ error: "Chýbajú údaje" }, 400);
      const { error: authErr } = await admin.auth.admin.updateUserById(
        parent_user_id,
        { user_metadata: { full_name: name } },
      );
      if (authErr) return j({ error: authErr.message }, 500);
      const { error: profErr } = await admin
        .from("profiles").update({ full_name: name }).eq("id", parent_user_id);
      if (profErr) return j({ error: profErr.message }, 500);
      return j({ success: true });
    }

    // ── Prilinkovanie druhého rodiča k existujúcemu dieťaťu ────────────
    if (action === "link_parent") {
      const { rider_id, email, first_name, last_name } = body;
      if (!rider_id || !email) return j({ error: "Chýbajú údaje" }, 400);

      const parentUserId = await findOrCreateParent(admin, {
        email, first_name, last_name,
      });
      if (!parentUserId.ok) return j({ error: parentUserId.error }, 500);

      const { error: linkErr } = await admin.from("rider_parents").upsert({
        rider_id, parent_user_id: parentUserId.id, is_primary: false,
      }, { onConflict: "rider_id,parent_user_id" });
      if (linkErr) return j({ error: linkErr.message }, 500);

      return j({ success: true, parent_user_id: parentUserId.id, is_new_user: parentUserId.isNew });
    }

    // ── Odlinkovanie druhého rodiča (hlavného nedá) ────────────────────
    if (action === "unlink_parent") {
      const { rider_id, parent_user_id } = body;
      if (!rider_id || !parent_user_id) return j({ error: "Chýbajú údaje" }, 400);
      // Zisti, či je to hlavný rodič
      const { data: rider } = await admin.from("riders").select("parent_user_id").eq("id", rider_id).maybeSingle();
      if (rider?.parent_user_id === parent_user_id) {
        return j({ error: "Hlavného rodiča nie je možné odlinkovať" }, 400);
      }
      const { error: delErr } = await admin.from("rider_parents").delete()
        .eq("rider_id", rider_id).eq("parent_user_id", parent_user_id);
      if (delErr) return j({ error: delErr.message }, 500);
      return j({ success: true });
    }

    // ── Registrácia jazdca ─────────────────────────────────────────────
    const {
      email, rider_name, group_id, training_days, training_time, training_schedule,
      parent_first_name, parent_last_name,
      second_email, second_first_name, second_last_name,
    } = body;

    if (!email || !rider_name) return j({ error: "Email a meno jazdca sú povinné" }, 400);

    // Hlavný rodič — vytvor alebo nájdi; nastav mu meno
    const primary = await findOrCreateParent(admin, {
      email, first_name: parent_first_name, last_name: parent_last_name,
    });
    if (!primary.ok) return j({ error: primary.error }, 500);
    const primaryUserId = primary.id;

    // Ak sa poslali mená, aktualizuj profil (aj pre existujúcich)
    const primaryFullName = fullNameOf(parent_first_name, parent_last_name, null);
    if (primaryFullName) {
      await admin.from("profiles").update({ full_name: primaryFullName }).eq("id", primaryUserId);
      await admin.auth.admin.updateUserById(primaryUserId, {
        user_metadata: { full_name: primaryFullName },
      });
    }

    // Rider
    const { data: rider, error: riderError } = await admin.from("riders").insert({
      name: rider_name,
      parent_user_id: primaryUserId,
      group_id: group_id || null,
      training_days: training_days ?? [],
      training_time: training_time || null,
      training_schedule: training_schedule || {},
    }).select().single();
    if (riderError) return j({ error: riderError.message }, 500);

    // Druhý rodič — voliteľný
    let secondaryInfo: { parent_user_id: string; is_new_user: boolean } | null = null;
    if (second_email && String(second_email).trim()) {
      const secondary = await findOrCreateParent(admin, {
        email: String(second_email).trim(),
        first_name: second_first_name,
        last_name: second_last_name,
      });
      if (secondary.ok) {
        await admin.from("rider_parents").upsert({
          rider_id: rider.id, parent_user_id: secondary.id, is_primary: false,
        }, { onConflict: "rider_id,parent_user_id" });
        secondaryInfo = { parent_user_id: secondary.id, is_new_user: secondary.isNew };
      }
    }

    return j({
      rider,
      parent_user_id: primaryUserId,
      is_new_user: primary.isNew,
      secondary: secondaryInfo,
    });
  } catch (err) {
    return j({ error: (err as Error).message }, 500);
  }
});

// ── Nájdi alebo vytvor rodiča ────────────────────────────────────────────
async function findOrCreateParent(admin: any, args: {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
}): Promise<{ ok: true; id: string; isNew: boolean } | { ok: false; error: string }> {
  const email = args.email.trim().toLowerCase();
  const fullName = fullNameOf(args.first_name, args.last_name, null);

  // Pokús sa nájsť
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email);
  if (existing) {
    if (fullName) {
      await admin.from("profiles").update({ full_name: fullName }).eq("id", existing.id);
    }
    return { ok: true, id: existing.id, isNew: false };
  }

  // Vytvor nového (dočasné heslo "rodič123")
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: "rodič123",
    email_confirm: true,
    user_metadata: { full_name: fullName || email },
  });
  if (createError || !created?.user) {
    return { ok: false, error: createError?.message ?? "Nepodarilo sa vytvoriť účet" };
  }
  const userId = created.user.id;

  // Rola 'parent'
  await admin.from("user_roles").insert({ user_id: userId, role: "parent" });

  // Meno + vynútená zmena hesla.
  // Každý nový účet dostáva rovnaké dočasné heslo "rodič123", takže zmenu
  // vynucujeme vždy. Predtým to bolo voliteľné a volajúci ju žiadal len pre
  // druhého rodiča — hlavný rodič tak zostal s verejne známym heslom natrvalo.
  const updates: Record<string, unknown> = { must_change_password: true };
  if (fullName) updates.full_name = fullName;
  await admin.from("profiles").update(updates).eq("id", userId);

  return { ok: true, id: userId, isNew: true };
}
