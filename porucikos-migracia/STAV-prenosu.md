# Stav prenosu — nová databáza je hotová a overená

Nový projekt: **`vfewttbwcxvvpjpmvhhy`** (eu-central-1, Free tier)
Starý projekt: `csteuzcbybwfwxmjmkjb` (Lovable Cloud) — **beží ďalej, nedotknutý**

Prenos prebehol **bez inštalácie čohokoľvek** — žiadne Docker, CLI, psql.
Namiesto dumpu posielala stará databáza dáta priamo do novej cez `net.http_post`
(rozšírenie `pg_net`, ktoré tam už bolo kvôli cronu). Cez môj kontext neprešli
žiadne dáta zákazníkov a nikdy som nepýtal ani nedostal heslo do databázy
ani service_role kľúč.

---

## 1. Schéma — zhodná

Aplikovaných 37 migrácií z repozitára v 5 dávkach (`porucikos_schema_b01`–`b05`).
Vynechané boli len dva `cron.schedule` príkazy, ktoré sa vytvárajú zvlášť.

| Vec | Stará | Nová |
|---|---|---|
| Tabuľky | 16 | 16 |
| Tabuľky s RLS | 16 | 16 |
| RLS politiky | 52 | 52 |
| Triggery | 8 | 8 |
| Enumy | 1 | 1 |
| Storage buckety | 2 | 2 |
| pgmq fronty | 4 | 4 |
| Funkcie | 19 | 17 |

Rozdiel 19 vs 17 je zámerný: `email_queue_dispatch` a `email_queue_wake`
nevytvára žiadna migrácia — Lovable ich pridal mimo nich a práve ony spúšťali
5-sekundový cron, ktorý nafúkal databázu na 1,5 GB. Viď `NALEZ-emailova-fronta.md`.

Kontrolné súčty obsahu (rovnaký dotaz na oboch databázach):

| Čo | md5 na oboch stranách |
|---|---|
| RLS politiky (52) | `d865c9d07d53fa9795a13cd813ae61dd` |
| Stĺpce tabuliek | `308bec28d7ec1b63be68791b7b498366` |
| Triggery | `04551a6286b025f30c9ff81c968b535a` |
| Table granty pre anon/authenticated (271) | `edfd6e13e118f27d3977decb220d25e3` |

---

## 2. Dáta — zhodné do posledného bajtu

Kontrolný súčet je `md5(string_agg(to_jsonb(riadok)::text, ... ORDER BY id))`,
teda porovnáva **celý obsah každého riadku**, nielen počty.

| Tabuľka | Riadkov | md5 (zhodné na oboch stranách) |
|---|---:|---|
| appointment_history | 10 633 | `ccb9692b85da8cb61754ecb3949c8207` |
| appointments | 2 686 | `8857dfeba6a2fde426e224556abc44ba` |
| auth.identities | 187 | `61a0a6383aae8ec88a509570e624362d` |
| auth.users | 180 | `cb6dedc6fef879d7a1dda493857e618e` |
| business_hours | 7 | `1aeb85b300f65192293907068ae45cab` |
| customers | 1 674 | `5d51cf10a60340a24a6d4ba52a9939fb` |
| employee_availability | 34 | `22f6e7a4002543e914683d16719658d1` |
| employee_services | 43 | `9494e49b9c26c62810566ba59af08ea0` |
| employees | 5 | `6fd74e94c7bf3a2ecd4af12832c869b2` |
| services | 24 | `66135dcc6b19023a022761d043df9938` |
| time_off | 3 110 | `bf791ace37ab9efae090a92177a6787b` |
| user_roles | 5 | `c62af23644591f63eba88091a9d1971f` |

`label_overrides` a `payments` sú na produkcii prázdne (0 riadkov).

Vrátane `auth.users.encrypted_password` — **heslá fungujú bez resetu**.
Prihlásenie cez Google tiež, lebo prešli aj `auth.identities`.

> Pozor: produkcia medzitým rastie (~24 rezervácií denne). Počty vyššie sú
> stav k času prenosu. Pred ostrým prepnutím treba dorobiť rozdiel v jednom
> zmrazenom okne — inak sa stratia rezervácie vytvorené medzitým.

---

## 3. Dočasný prístup — zrušený

Aby stará databáza mohla zapisovať do novej cez PostgREST, boli dočasne
vytvorené politiky `tmp_migration_ingest` / `tmp_migration_read`, granty pre
`anon` a dve SECURITY DEFINER funkcie na `auth` schému.

**Všetko je zrušené** migráciou `temp_migration_ingest_revoke`. Overené:
0 dočasných politík, 0 dočasných funkcií, všetky 3 triggery na `appointments`
späť zapnuté (`=O`). Kontrolné súčty dát po zapnutí triggerov nezmenené.

---

## 4. Nájdená chyba, ktorá by systém položila

Pri aplikovaní migrácií cez MCP sa **nespustili Supabase default privileges**,
takže `anon` a `authenticated` nemali table-level granty. RLS politiky by boli
v poriadku, ale Postgres kontroluje GRANT **pred** RLS — každý prihlásený
používateľ by dostal `permission denied for table appointments`.

Opravené migráciou `restore_default_table_grants`. Granty sú teraz zhodné
s produkciou (271 záznamov, rovnaký md5), vrátane jedinej odchýlky, ktorú má
aj produkcia: `anon` **nemá** SELECT na `public.employees` a číta výhradne
cez view `employees_public`.

---

## 5. Cron úlohy

| Úloha | Rozvrh | Stav teraz | Prečo |
|---|---|---|---|
| `auto-complete-appointments` | `*/15 * * * *` | **vypnutá** | Zapisovala by do `appointments` a rozbila overenú zhodu so starou DB. |
| `send-booking-reminders-15min` | `*/30 * * * *` | **vypnutá** | Inak by zákazníci dostávali pripomienky **dvakrát** — raz zo starého, raz z nového projektu. |
| `purge-cron-history` | `0 3 * * *` | zapnutá | Nová úloha. Presne toto na Lovable chýbalo a preto tam narástlo 1,5 GB. |

Pôvodne bežali každých 5 a 15 minút (384 behov denne). Nové 15 a 30 minút
= 144 behov denne, teda **o 62 % menej zápisov**. Ani jedna z nich rýchlejší
takt nepotrebuje — pripomienky hľadajú termíny v 2 hodiny širokom okne.

**Obe vypnuté sa zapínajú až pri ostrom prepnutí:**

```sql
UPDATE cron.job SET active = true
 WHERE jobname IN ('auto-complete-appointments','send-booking-reminders-15min');
```

---

## 6. Edge funkcie — nasadené

| Funkcia | verify_jwt | Kto ju volá |
|---|---|---|
| `send-email` | false | frontend, `handle-booking-action`, `send-booking-reminders`, `create-guest-booking` |
| `send-booking-reminders` | false | cron |
| `create-guest-booking` | false | frontend (`BookingSummary.tsx:136`) |
| `handle-booking-action` | false | odkazy v e-mailoch |
| `manage-employee-auth` | true | admin (`src/lib/employeeAuth.ts`) |

`manage-employee-auth` v pôvodnom pláne chýbala — bez nej by majiteľ nevedel
zakladať ani meniť účty zamestnancov.

**Nenasadené zámerne:** `auth-email-hook` a `process-email-queue` — to je
Lovable mašinéria, ktorú nahrádza Brevo SMTP priamo v Supabase Auth.
Za celý život projektu cez ňu prešlo 9 e-mailov. Viď `OVERENIE-zrusenie-auth-hooku.md`.

Jediná zmena v kóde oproti repozitáru sú 2 riadky v `send-email/index.ts`
(`LOGO_URL` a `PROJECT_REF` na nový projekt). Nasadený obsah som stiahol späť
a porovnal so zdrojom — vrátane všetkých únikových sekvencií (`\r\n` v ICS,
dvojité `\\n` v popise udalosti, `/\s+/`). Zhoda.

---

## 7. Zámerná odchýlka od produkcie

`public.create_guest_booking()` má na Lovable EXECUTE aj pre `anon`
a `authenticated`. Je to pozostatok default privileges — migrácia
`20260619113416` robí presný opak (`REVOKE ALL FROM PUBLIC`,
`GRANT ... TO service_role`).

Overené v kóde: funkciu volá **výhradne** edge funkcia `create-guest-booking`
cez service_role (`supabase/functions/create-guest-booking/index.ts:51`),
frontend nikdy. Na novom projekte má preto len `service_role`.
Správanie identické, prístup tesnejší.

---

## Čo ešte zostáva

- [ ] **Secrets pre edge funkcie:** `BOOKING_ACTION_HMAC_SECRET` (musí byť
      **presne tá istá hodnota** ako na starom projekte — v e-mailoch ležia
      odkazy platné 30 dní a 30 rezervácií čaká na potvrdenie) a `BREVO_API_KEY`.
- [ ] **Storage:** 13 súborov v 2 bucketoch (11,6 MB) prekopírovať cez dashboard.
      Bez toho nebude logo v e-mailoch ani fotky barberov.
- [ ] **Google OAuth** podľa `patches/01-google-oauth.md` + odstrániť
      `@lovable.dev/cloud-auth-js` z frontendu.
- [ ] **"Confirm email" musí zostať VYPNUTÉ.** Zapnuté rozbije registráciu:
      `signUp()` nevráti session, vloženie do `customers` (`useAuth.ts:106`)
      pobeží ako anon a RLS ho odmietne — zákazník uvidí „Registrácia úspešná",
      ale záznam nevznikne.
- [ ] Dorobiť rozdiel dát v zmrazenom okne, potom zapnúť tie 2 cron úlohy.
- [ ] Vercel env premenné, DNS na Cloudflare, nočná záloha cez GitHub Action.
