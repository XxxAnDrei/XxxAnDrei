# Migrácia Poručíkos — runbook

Presun rezervačného systému z Lovable Cloud na vlastnú Supabase.
Hosting na Verceli už beží a v tejto migrácii sa nemení.

**Stav k 4. 9. 2026:** fáza 1 hotová. Nový projekt je založený a nastavený,
databáza je zatiaľ prázdna (0 tabuliek, 0 účtov). Na produkcii sa nezmenilo nič.

---

## Východiskový stav (namerané, nie odhadnuté)

| | |
|---|---|
| Starý projekt (Lovable Cloud) | `csteuzcbybwfwxmjmkjb` |
| **Nový projekt** | **`vfewttbwcxvvpjpmvhhy`** — Central EU (Frankfurt), Free |
| Tabuľky v `public` | 16 |
| RLS politiky | 52 (všetky tabuľky majú RLS zapnuté) |
| DB funkcie / triggery | 19 / 10 |
| Enum typy | 1 (`app_role`: owner, employee, customer) |
| Migračné súbory v repozitári | 37 |
| Edge funkcie | 6 |
| Cron úlohy | 2 |
| pgmq fronty | 4 (2 hlavné + 2 DLQ) |
| Storage | 2 buckety, 13 súborov, 11,6 MB |
| Účty | 180 — z toho **105 cez Google**, 82 e-mail+heslo |
| Rezervácie | 2 444, z toho **393 budúcich** |
| Zákazníci | 1 544 |
| Prevádzka | ~24 rezervácií denne |
| Najtichšie okno | **02:00–05:00** (1–2 rezervácie/hod.) |

---

## Štyri veci, ktoré sa dajú ľahko prehliadnuť

### 1. HMAC kľúč pre odkazy v e-mailoch

E-maily obsahujú tlačidlá „Potvrdiť" / „Zrušiť". Odkazy sú podpísané cez
`BOOKING_ACTION_HMAC_SECRET` a smerujú na **starý** project ref. Platia **30 dní**
a práve teraz **30 rezervácií čaká na potvrdenie**.

- Do nového projektu prenes **ten istý** `BOOKING_ACTION_HMAC_SECRET`.
- Starý projekt nechaj bežať ešte **mesiac** po prepnutí.

### 2. JWT secret — všetci sa odhlásia

Každý Supabase projekt má vlastný JWT secret. S novým projektom sa staré tokeny
stanú neplatnými a **všetkých 180 ľudí sa bude musieť znovu prihlásiť**.

To je v poriadku a je to bezpečnejšia voľba — ale **barberi o tom musia vedieť
dopredu**, inak to v pondelok ráno vyzerá ako rozbitý admin.

(Dá sa tomu vyhnúť skopírovaním JWT secretu do nového projektu, ale to
regeneruje anon aj service_role kľúče a pridáva komplikáciu. Neodporúčam.)

### 3. Storage sa nedumpuje

`pg_dump` prenesie záznamy v `storage.objects`, ale **nie samotné súbory**.
Bez kroku `30-copy-storage.mjs` zmiznú fotky barberov a logo v e-mailoch.

### 4. E-mailová fronta a 5-sekundový cron

Trigger na pgmq frontách plánuje cron úlohu s taktom **5 sekúnd** (17 280 behov
denne) vždy, keď sa odošle auth e-mail. **Toto je zdroj tých 1,5 GB.**
Zároveň `auth-email-hook` overuje podpis cez `@lovable.dev/webhooks-js` —
na čistom Supabase nebude fungovať a padne potvrdzovanie registrácií
aj reset hesla.

**ROZHODNUTÉ (4. 9. 2026): cesta A** — auth hook sa ruší, auth e-maily pôjdu
cez Supabase + Brevo SMTP. Tým odpadá celý 5-sekundový cron.
Rozbor → `NALEZ-emailova-fronta.md`, overenie dopadov →
`OVERENIE-zrusenie-auth-hooku.md`.

Z toho vyplýva jedno kritické nastavenie:
**„Confirm email" musí na novom projekte zostať VYPNUTÉ** (na starom je
vypnuté — 180/180 účtov potvrdených, ale potvrdzovací e-mail dostalo len 7).
So zapnutým potvrdzovaním `signUp()` nevráti session, insert do `customers`
padne na RLS a nový zákazník zostane bez záznamu.

---

## Fáza 1 — príprava (žiadny dopad na produkciu)

> Všetko v tejto fáze sa dá robiť cez deň, kým systém normálne beží.

- [x] **1.1** Založiť Supabase účet na gmaile kaderníctva, pridať sa ako owner
- [x] **1.2** Nový projekt, región `eu-central-1` (Frankfurt) — org `porucikos`, Free
- [x] **1.3** Zapísať si nový project ref (`vfewttbwcxvvpjpmvhhy`) a heslo do DB
- [x] **1.4** Rozšírenia — overené, všetkých 7 je na novom projekte
       predinštalovaných (`pg_cron` 1.6.4, `pg_net` 0.20.4, `pgmq` 1.5.1,
       `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`)
- [x] **1.4b** Odobraté default privilégiá v `public` pre `anon`/`authenticated`
- [x] **1.4c** Rozhodnuté: cesta A (zrušiť hook, ísť cez Brevo SMTP)
- [x] **1.4d** Overené, že **„Confirm email" je VYPNUTÉ**
       (Authentication → Sign In / Providers → Email)
- [x] **1.5** Google Cloud Console — OAuth klient → `patches/01-google-oauth.md`, krok A
- [x] **1.6** Supabase Auth → Google provider + redirect URLs → krok B
- [x] **1.7** Brevo **SMTP** do *Authentication → Emails → SMTP Settings*
       (`smtp-relay.brevo.com:587`). Pozor: sú to SMTP údaje, **nie** REST API
       kľúč, ktorý používa `send-email`. Vstavaný Supabase mailer zvláda len
       2 e-maily/hod., čo by nestačilo.
- [x] **1.8** Auth hook — **nič nenastavuj**, len over

       Na novom projekte je *Send Email Hook* vypnutý automaticky. Tento bod je
       tu len ako poistka pre krok 2.8, aby sa `auth-email-hook` omylom
       nenasadil a nezapol zo zvyku.

       Hook je výhybkár, ktorý rozhoduje, ktorou cestou pôjde auth e-mail:

       ```
       ZAPNUTÝ (starý projekt):
         Supabase Auth → auth-email-hook → pgmq fronta
                       → cron každých 5 s → process-email-queue → Brevo

       VYPNUTÝ (nový projekt — chceme toto):
         Supabase Auth → SMTP → Brevo
       ```

       Zapnutie hooku by vrátilo presne ten 5-sekundový cron, kvôli ktorému
       sa celá migrácia robí.

## Fáza 2 — skúšobný prenos (žiadny dopad na produkciu)

> Zo starej databázy sa len číta. Toto je najdôležitejšia fáza — tu sa nájdu
> všetky drobné chyby, kým je čas ich riešiť.

### Čo musí byť nainštalované

Skripty sú v bashi, takže na Windows ich púšťaj v **Git Bash** alebo **WSL**,
nie v PowerShelli.

| Nástroj | Načo | Overenie |
|---|---|---|
| **Supabase CLI** | `supabase db dump` | `supabase --version` |
| **PostgreSQL 17 klient** | `psql`, `pg_dump` | `psql --version` |
| **Docker Desktop** | `supabase db dump` beží v kontajneri | `docker ps` |
| **Node 18+** | prenos súborov v storage | `node --version` |

Docker musí byť **spustený**, nie len nainštalovaný — inak `supabase db dump`
spadne s nejasnou chybou o nedostupnom daemone.

### Údaje, ktoré budeš potrebovať

| Premenná | Kde ju vziať |
|---|---|
| `OLD_DB_URL` | Lovable → projekt porucikos → Cloud → Database → Connection string |
| `NEW_DB_URL` | Supabase → nový projekt → **Connect** (hore) → Session pooler |
| `OLD_SERVICE_KEY` | Lovable → Cloud → API keys → `service_role` |
| `NEW_SERVICE_KEY` | Supabase → Project Settings → API keys → `service_role` |

Connection string kopíruj z dashboardu, neskladaj ho ručne — hostname poolera
sa medzi regiónmi líši.

Nový anon key (verejný, je aj tak v prehliadačovom balíku) pre krok 2.7:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmZXd0dGJ3Y3h2dnBqcG12aGh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTY2MjIsImV4cCI6MjEwNDAzMjYyMn0.8YrUfoF-X81nNkJTmX626MNz2yBW2r5nfsT6lhwqS94
```

### Kroky

- [ ] **2.1** `export OLD_DB_URL='...'` (Lovable → Cloud → Database → Connection string)
- [ ] **2.2** `./scripts/10-dump-old.sh` — záloha + odtlačok starej DB
- [ ] **2.3** `export NEW_DB_URL='...'` `export OUT_DIR='./dump-...'`
- [ ] **2.4** `./scripts/20-restore-new.sh` — obnova + automatické porovnanie odtlačkov
- [ ] **2.5** Prejsť `fingerprint.diff`. Rozdiely v RLS, funkciách alebo počte
       účtov podľa poskytovateľa = **zastaviť a riešiť**
- [ ] **2.6** `node scripts/30-copy-storage.mjs` — 13 súborov
- [ ] **2.7** `psql "$NEW_DB_URL" -v new_project_ref=... -v new_anon_key=... -f sql/30-recreate-cron.sql`
- [ ] **2.8** Nasadiť **4 edge funkcie** (nie 6):
       `send-email`, `send-booking-reminders`, `create-guest-booking`,
       `handle-booking-action`.
       **Nenasadzovať** `auth-email-hook` ani `process-email-queue` — rušia sa.
- [ ] **2.9** Tajné kľúče do edge funkcií → `SECRETS.md`
- [ ] **2.10** Aplikovať patch `01-google-oauth.md` (kroky C1–C3) na vetve, **nie na main**
- [ ] **2.11** Preview nasadenie na Verceli s novými `VITE_*` premennými
- [ ] **2.12** Prejsť testovací zoznam z `01-google-oauth.md`, krok E
- [ ] **2.13** Registrácia nového testovacieho účtu e-mailom + overiť v DB,
       že pribudol riadok v `public.customers`
       (toto odhalí zle nastavené „Confirm email")
- [ ] **2.14** Reset hesla — overiť, že e-mail dorazí cez Brevo SMTP

> Po fáze 2 stále beží všetko po starom. Nová databáza je len pripravená kópia.

## Fáza 3 — ostré prepnutie (02:00–05:00)

> Jediná časť s reálnym dopadom. Rátaj s 1–2 hodinami.

- [ ] **3.1** Upozorniť barberov, že sa budú musieť znovu prihlásiť
- [ ] **3.2** Na **starej** DB zastaviť cron, nech počas prenosu nič nezapisuje:
      ```sql
      UPDATE cron.job SET active = false;
      ```
- [ ] **3.3** Finálny `./scripts/10-dump-old.sh` (do čerstvého adresára)
- [ ] **3.4** Nový projekt vyčistiť a `./scripts/20-restore-new.sh`
- [ ] **3.5** `node scripts/30-copy-storage.mjs`
- [ ] **3.6** `sql/30-recreate-cron.sql` s novým ref a anon key
- [ ] **3.7** V `send-email/index.ts` prepísať `LOGO_URL` a `PROJECT_REF` na nové
- [ ] **3.8** Znovu nasadiť edge funkcie
- [ ] **3.9** Vercel → Environment Variables → nové `VITE_SUPABASE_URL`,
       `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` → redeploy
- [ ] **3.10** Overiť naživo na `porucikos.sk`:
      - [ ] prihlásenie cez Google
      - [ ] prihlásenie e-mailom a heslom
      - [ ] vytvorenie rezervácie ako hosť
      - [ ] príchod potvrdzovacieho e-mailu
      - [ ] admin kalendár ukazuje budúce rezervácie (má ich byť ~393)
      - [ ] zákazník vidí svoju históriu
- [ ] **3.11** Počkať 20 minút a overiť, že cron beží:
      ```sql
      SELECT jobid, status, start_time FROM cron.job_run_details
      ORDER BY runid DESC LIMIT 10;
      ```

### Ak sa niečo pokazí — návrat späť

Starý projekt je stále nedotknutý a plný. Návrat = vrátiť staré `VITE_*`
premenné na Verceli, redeploy a na starej DB `UPDATE cron.job SET active = true;`.
Trvá to pár minút. **Preto sa starý projekt mesiac nemaže.**

Jediné, čo sa nevráti, sú rezervácie vytvorené medzi prepnutím a návratom —
v okne 02:00–05:00 rádovo jednotky. Preto to okno.

## Fáza 4 — po prepnutí

- [ ] **4.1** Skopírovať `templates/backup-workflow.yml` do
       `porucikos/.github/workflows/backup.yml`, pridať secret, spustiť ručne
- [ ] **4.2** Overiť, že prvá záloha vznikla a obsahuje `auth.users`
- [ ] **4.3** Nechať týždeň bežať, sledovať e-maily a pripomienky
- [ ] **4.4** Po týždni: patch `01-google-oauth.md`, kroky D1–D2 (odstránenie
       zvyškov Lovable z kódu)
- [ ] **4.5** Po mesiaci: starý Lovable projekt vypnúť, Lovable znížiť na free

---

## Nezávisle od všetkého: upratanie cron logov

`sql/00-cleanup-cron-logs.sql` sa dá pustiť na **starej** DB hocikedy.
Zhodí ju z 1554 MB na ~25 MB. Cron úloh sa nedotýka, pripomienky bežia ďalej.

Ak by z migrácie nakoniec zišlo, toto je aj tak správne spraviť.
