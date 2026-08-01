# Pumptrack Hub – presuny jazdcov medzi skupinami (oprava + rozšírenie)

Zmeny pre Lovable projekt **ctvz / Pumptrack Hub** (`ad621643-a101-4e51-83a2-87d4a24f5d47`).
Súbory tu zrkadlia cesty v Lovable projekte.

## 1. Prečo rodič nevidel tréning, do ktorého bolo dieťa presunuté

Príčina je v RLS politike na `training_sessions`:

```sql
-- politika "Parents view group sessions"
EXISTS (
  SELECT 1 FROM riders r
  WHERE r.id IN (SELECT my_rider_ids(auth.uid()))
    AND r.group_id = training_sessions.group_id
)
```

Rodič smie čítať len tréningy **domovskej** skupiny dieťaťa (`riders.group_id`).
Presun sa ukladá do `session_rider_moves` a cieľový tréning patrí **inej** skupine,
takže podmienka neplatí a `SELECT` vráti prázdny výsledok – bez chyby.

Dôsledok v `src/pages/ParentDashboard.tsx`: dotaz na chýbajúce tréningy

```ts
supabase.from("training_sessions").select("*, groups(name)").in("id", missing)
```

vráti `[]`, presunutý tréning sa nikdy nedostane do stavu `sessions`, a keďže
render pre presunutého jazdca filtruje `selectedSessions.filter(s => s.id === move.session_id)`,
rodičovi sa v ten deň nezobrazí **nič** – ani pôvodný, ani nový tréning.

Overené na produkčných dátach (4 presuny k 2. 8. 2026, pri všetkých
`riders.group_id <> training_sessions.group_id`).

Oprava: nová politika `Parents view moved-in sessions`.

## 2. Ďalšie zmeny

- `parent_group_ids()` bralo do úvahy len `riders.parent_user_id`, takže druhý
  rodič (`rider_parents`) nevidel spolujazdcov. Zjednotené s `my_rider_ids()`.
- Nová RPC `training_day_overview(_date)` – súpisky všetkých skupín pre daný deň
  vrátane stavu prítomnosti, rešpektuje jednorazové presuny (kto je presunutý
  preč sa odráta, kto je presunutý sem sa pridá ako hosť). `SECURITY DEFINER`
  s úzkym výstupom: meno jazdca, skupina, príznak prítomnosti – nič viac.
- `ParentDashboard.tsx`:
  - karta skupiny ukazuje po presune súpisku **cieľovej** skupiny,
  - neprítomnosti sa načítavajú až nad kompletným zoznamom tréningov (predtým
    sa pre presunutý tréning nenačítali a tlačidlo Neprítomnosť malo zlý stav),
  - nový odsek **Ostatné skupiny** s rozklikávacími oknami pre jednotlivé skupiny.

## 3. Presuny v trénerských pohľadoch

Súpisku podľa `riders.group_id` staval aj `Attendance.tsx` a `AdminDashboard.tsx`
(domovská stránka trénera – role `admin`), takže presunutý jazdec chýbal v cieľovej
skupine a stále sa počítal do pôvodnej. `Trainings.tsx` to riešil už predtým.

- `Attendance.tsx` – `getRidersForSession()` ako v `Trainings.tsx`; počty sa rátajú
  len zo súpisky daného tréningu, takže staré odhlásenie presunutého jazdca
  neskresľuje výsledok. Hosť má odznak „z &lt;domovská skupina&gt;“.
- `AdminDashboard.tsx` – súpisky a stav prítomnosti berie z RPC
  `training_day_overview`, rovnako ako rodičovský pohľad. Odznak „presun“.

Miesta, kde `group_id` zostáva správne (trvalé zaradenie, nie denná súpiska):
správa jazdcov, platby, časové sloty skupín, lap times.

## 4. Notifikácie rodičom o zmenách tréningu

Zmena miesta sa ukladala, ale nezaradila sa medzi zmeny spúšťajúce notifikáciu –
`notifyTrainingChange` skončil na prázdnom poli, takže neodišiel ani push, ani
email. Bez notifikácie bolo aj obnovenie zrušeného tréningu a jeho vymazanie.

- `Trainings.tsx` – porovnanie `location` → `kind: "location"`; `restoreSession`
  posiela `restored`; `deleteSession` posiela `deleted` **pred** zmazaním, lebo
  edge funkcia si tréning dohľadáva podľa id.
- `notify-training-change` – nové typy `location` / `restored` / `deleted`,
  jedna súhrnná správa za celé uloženie namiesto jednej za každú zmenu, a do
  správ pribudol aktuálny stav tréningu (dátum, čas od–do, miesto, tréner).

Email je pre klub hlavný kanál: z 37 rodičov má PWA push len 7.
`sendEmail` sa potichu preskočí, ak chýba secret `BREVO_API_KEY`.

## 5. Obnovenie hesla („Zabudnuté heslo?“)

Symptóm bol „po kliknutí sa nič nestane“. Tlačidlo pritom fungovalo –
v `auth.users` malo `recovery_sent_at` vyplnené 4 účtov.

Príčina: aplikácia používa shadcn `useToast` (16 súborov), ale v `App.tsx`
bol pripojený len `<Sonner/>`. Shadcn `<Toaster/>` nebol v strome nikde,
takže sa nevykreslil **žiadny** toast z `useToast` – ani pri prihlásení,
dochádzke či tréningoch. Oprava je jednoriadková, dopad má na celú appku.

Reset hesla zároveň prešiel z `supabase.auth.resetPasswordForEmail()` na
vlastnú edge funkciu `request-password-reset`:

- email cez Brevo z klubovej adresy v CTVZ brandingu, nie cez vstavaný mailer,
- cieľ odkazu berie server zo `SITE_URL` (prípadne `APP_URL`); klient ho
  neposiela, takže sa nedá presmerovať recovery token na cudziu doménu,
- rate limit 3/hod na email a 10/hod na IP,
- odpoveď vždy `{ ok: true }` s minimálnym trvaním 700 ms – cez endpoint sa
  nedá zisťovať, ktoré adresy majú konto (ani obsahom, ani časom odpovede),
- email a IP sa ukladajú len ako SHA-256,
- `password_reset_attempts` má RLS zapnuté a zámerne **nula policy**, práva
  odobrané `anon` aj `authenticated` – dostane sa k nej len `service_role`.

`ResetPassword.tsx` navyše zobrazí dôvod, keď je odkaz expirovaný alebo už
použitý; predtým ukazoval mätúce „Otvorte odkaz z emailu na tomto zariadení“.

## Nasadenie

1. Migrácie:
   - `20260731090000_parent_moved_sessions_and_day_overview.sql`
     (musí prebehnúť skôr, inak RPC `training_day_overview` neexistuje)
   - `20260801120000_password_reset_attempts.sql`
2. Frontend: `ParentDashboard.tsx`, `Attendance.tsx`, `AdminDashboard.tsx`,
   `Trainings.tsx`, `App.tsx`, `Login.tsx`, `ResetPassword.tsx`
3. Edge funkcie – samostatný deploy, nasadenie frontendu ich neaktualizuje:
   - `notify-training-change`
   - `request-password-reset` (musí mať `verify_jwt = false`)
4. Secrets: `BREVO_API_KEY`, `SITE_URL` (alebo `APP_URL`).
   Voliteľne `EMAIL_FROM_NAME` – default je „CTVZ Platby“, čo pri emaile
   o hesle znie zvláštne.
5. Supabase → Authentication → URL Configuration: Site URL a Redirect URLs
   musia sedieť s adresou aplikácie (`https://ctvz.vercel.app`), inak GoTrue
   recovery odkaz zahodí a presmeruje na prihlásenie bez tokenu.

## Kde je kanonický kód

Tento adresár je len kópia pre dokumentáciu. Ostrý kód je v
`XxxAnDrei/ctvz` vetva `main` (commit a627e0e); tam sú zmeny zlúčené
a odtiaľ sa nasadzuje. Obe migrácie sú aplikované na Supabase projekt
`ahuszqknzgghrpyqzugz`. Appka beží na Verceli (`https://ctvz.vercel.app`).
