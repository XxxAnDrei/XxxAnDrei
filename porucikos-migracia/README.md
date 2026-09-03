# Migrácia Poručíkos z Lovable Cloud

Toolkit na presun rezervačného systému **Poručíkos Barbershop** z Lovable Cloud
na vlastnú Supabase, s cieľom dostať mesačné náklady na 0 €.

**Na produkcii sa zatiaľ nezmenilo nič.** Všetko tu sú len súbory pripravené na
neskoršie spustenie. Voči starej databáze prebehli výhradne čítacie dotazy.

---

## Prečo

Stará databáza má **1554 MB**, z toho **1547 MB (99,5 %)** je log spustení
cronu, ktorý sa nikdy nemazal. Reálne aplikačné dáta sú **5,3 MB**.
Lovable Cloud účtuje aj úložisko, takže 100 kreditov (25 €) mesačne odchádza
zväčša za odpad a za nonstop bežiaci Postgres server.

Po migrácii: Supabase Free (500 MB limit, využitie ~5 %), Vercel/Cloudflare
hosting, Brevo e-maily — všetko v rámci free tierov.

---

## Čo kde je

```
porucikos-migracia/
├── RUNBOOK.md                    ← ZAČNI TU. Fázy 1–4, checklisty, návrat späť.
├── SECRETS.md                    Zoznam kľúčov (názvy, nie hodnoty).
├── sql/
│   ├── 00-cleanup-cron-logs.sql  Upratanie 1,5 GB. Nezávislé, dá sa hneď.
│   ├── 10-fingerprint.sql        Odtlačok schémy a dát na porovnanie starej/novej.
│   ├── 20-recreate-queues.sql    pgmq fronty (dumpom sa neprenesú správne).
│   └── 30-recreate-cron.sql      2 cron úlohy + nová purge úloha.
├── scripts/
│   ├── 10-dump-old.sh            Záloha starej DB. Len číta.
│   ├── 20-restore-new.sh         Obnova do novej + automatické porovnanie.
│   └── 30-copy-storage.mjs       13 súborov v 2 bucketoch (pg_dump ich neberie).
├── patches/
│   └── 01-google-oauth.md        Náhrada Lovable OAuth za natívny Supabase.
└── templates/
    └── backup-workflow.yml       Nočné zálohy cez GitHub Actions.
```

---

## Rýchly štart

```bash
# 1) Upratanie cron logov — dá sa hneď, nezávisle od migrácie
psql "$OLD_DB_URL" -f sql/00-cleanup-cron-logs.sql

# 2) Skúšobný prenos — stará DB sa nemení
export OLD_DB_URL='...' NEW_DB_URL='...'
./scripts/10-dump-old.sh
export OUT_DIR='./dump-RRRRMMDD-HHMMSS'
./scripts/20-restore-new.sh          # sám porovná odtlačky
node scripts/30-copy-storage.mjs
```

Potrebné nástroje: Supabase CLI, psql 17+, Docker Desktop, Node 18+.

---

## Čo je najrizikovejšie

1. **Google prihlásenie** — používa ho 105 zo 180 účtov a dnes ide cez Lovable.
   Testovať na preview, nikdy nie rovno na produkcii. → `patches/01-google-oauth.md`
2. **HMAC kľúč** — v e-mailoch ležia odkazy platné 30 dní; 30 rezervácií práve
   čaká na potvrdenie. Kľúč sa musí preniesť **nezmenený**.
3. **Storage** — `pg_dump` súbory neberie. Bez kroku 30 zmiznú fotky barberov.
4. **JWT secret** — po prepnutí sa všetkých 180 ľudí musí znovu prihlásiť.
   Barberom to treba povedať dopredu.

---

## Stav

| Fáza | Stav |
|---|---|
| Analýza a zmeranie | hotové |
| Príprava skriptov a patchov | hotové |
| 1 — nový Supabase projekt | hotové — `vfewttbwcxvvpjpmvhhy` (Frankfurt) |
| 2 — skúšobný prenos | **na rade** |
| 3 — ostré prepnutie | čaká na fázu 2 |
| 4 — zálohy a upratanie | čaká na fázu 3 |

Podrobný rozbor nákladov a rozhodnutí:
<https://claude.ai/code/artifact/965ccc9b-5e2b-4a25-a4f1-d8ae1df6f79b>
