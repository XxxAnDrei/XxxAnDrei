#!/usr/bin/env bash
# =============================================================================
# 20-restore-new.sh   —   OBNOVA DO NOVÉHO SUPABASE PROJEKTU
# =============================================================================
# Píše LEN do novej databázy. Starej sa nedotýka.
#
# Prvý raz to pusti NANEČISTO, dlho pred ostrým prepnutím — zistíš tým
# všetky drobné chyby v pokoji. Pred ostrým behom nový projekt buď resetni,
# alebo založ ďalší.
#
# Použitie:
#   export NEW_DB_URL='postgresql://postgres.NOVYREF:HESLO@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
#   export OUT_DIR='./dump-20260903-181500'
#   ./scripts/20-restore-new.sh
# =============================================================================
set -euo pipefail

: "${NEW_DB_URL:?Nastav NEW_DB_URL (connection string NOVEJ databázy)}"
: "${OUT_DIR:?Nastav OUT_DIR (adresár so zálohou z 10-dump-old.sh)}"

HERE="$(cd "$(dirname "$0")" && pwd)"

for f in roles.sql schema.sql data.sql; do
  [[ -f "$OUT_DIR/$f" ]] || { echo "Chýba $OUT_DIR/$f"; exit 1; }
done

echo "==> Obnovujem do: ${NEW_DB_URL%%:*}...(skryté)"
echo "==> Zo zálohy:    $OUT_DIR"
echo

# -----------------------------------------------------------------------------
# 0) Poistka proti omylu — nesmieme písať do starej DB
# -----------------------------------------------------------------------------
if [[ "$NEW_DB_URL" == *"csteuzcbybwfwxmjmkjb"* ]]; then
  echo "!!! NEW_DB_URL ukazuje na STARÝ Lovable projekt. Končím."
  exit 1
fi

# -----------------------------------------------------------------------------
# 1) Rozšírenia — musia existovať pred schémou
# -----------------------------------------------------------------------------
echo "==> [1/6] Rozšírenia"
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgmq;
SQL

# -----------------------------------------------------------------------------
# 2) pgmq fronty — pred dátami
# -----------------------------------------------------------------------------
echo "==> [2/6] pgmq fronty"
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f "$HERE/../sql/20-recreate-queues.sql"

# -----------------------------------------------------------------------------
# 3) Odobratie default privilégií
#    Bez tohto zdedia tabuľky široké práva pre anon/authenticated a RLS
#    politiky by sa dali obísť. Supabase to výslovne odporúča.
# -----------------------------------------------------------------------------
echo "==> [3/6] Odoberám default privilégiá (bezpečnosť)"
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
SQL

# -----------------------------------------------------------------------------
# 4) Roly + schéma + dáta v jednej transakcii
#    session_replication_role = replica vypne triggery počas importu, inak by
#    log_appointment_change nafúkal appointment_history duplikátmi.
# -----------------------------------------------------------------------------
echo "==> [4/6] Roly, schéma a dáta"
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$OUT_DIR/roles.sql" \
  --file "$OUT_DIR/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$OUT_DIR/data.sql" \
  --dbname "$NEW_DB_URL"

# -----------------------------------------------------------------------------
# 4b) Doplnkový auth dump, ak ho 10-dump-old.sh musel vyrobiť
# -----------------------------------------------------------------------------
if [[ -f "$OUT_DIR/auth_data.sql" ]]; then
  echo "==> [4b/6] Doplnkové auth účty (auth_data.sql)"
  psql --single-transaction --variable ON_ERROR_STOP=1 \
    --command 'SET session_replication_role = replica' \
    --file "$OUT_DIR/auth_data.sql" \
    --dbname "$NEW_DB_URL"
fi

echo "==> Kontrola: účty v novej DB podľa poskytovateľa"
psql "$NEW_DB_URL" -At -c \
  "SELECT provider || ': ' || count(*) FROM auth.identities GROUP BY provider ORDER BY provider;"
echo "    (musí sedieť s výpisom z 10-dump-old.sh — 105 google / 82 email)"

# -----------------------------------------------------------------------------
# 5) História migrácií
# -----------------------------------------------------------------------------
if [[ -f "$OUT_DIR/history_schema.sql" ]]; then
  echo "==> [5/6] História migrácií"
  psql --single-transaction --variable ON_ERROR_STOP=1 \
    --file "$OUT_DIR/history_schema.sql" \
    --file "$OUT_DIR/history_data.sql" \
    --dbname "$NEW_DB_URL" || echo "    (nepodstatné, pokračujem)"
fi

# -----------------------------------------------------------------------------
# 6) Odtlačok novej DB + porovnanie
# -----------------------------------------------------------------------------
echo "==> [6/6] Odtlačok novej databázy"
psql "$NEW_DB_URL" -f "$HERE/../sql/10-fingerprint.sql" \
  > "$OUT_DIR/fingerprint-new.txt" 2>&1

echo
echo "==> POROVNANIE ODTLAČKOV"
echo "----------------------------------------------------------------"
if diff -u "$OUT_DIR/fingerprint-old.txt" "$OUT_DIR/fingerprint-new.txt" > "$OUT_DIR/fingerprint.diff"; then
  echo "IDENTICKÉ — schéma aj počty sedia."
else
  echo "Rozdiely uložené v: $OUT_DIR/fingerprint.diff"
  echo
  echo "OČAKÁVANÉ rozdiely (v poriadku):"
  echo "  - počty riadkov, ak medzitým na starej pribudli rezervácie"
  echo "  - sekcia CRON ÚLOHY (na novej ich vytvoríš až krokom 30)"
  echo "  - sekcia STORAGE (súbory sa kopírujú samostatne, krok 30-copy-storage)"
  echo
  echo "NEOČAKÁVANÉ rozdiely (zastav a rieš):"
  echo "  - čokoľvek v sekcii RLS — plné definície politík"
  echo "  - chýbajúce funkcie alebo triggery"
  echo "  - iný počet účtov v AUTH podľa poskytovateľa"
  echo
  head -60 "$OUT_DIR/fingerprint.diff"
fi

echo
echo "Ďalšie kroky:"
echo "  1) scripts/30-copy-storage.mjs   — 13 súborov v 2 bucketoch"
echo "  2) sql/30-recreate-cron.sql      — cron úlohy s NOVÝM ref a anon key"
echo "  3) supabase functions deploy     — 6 edge funkcií + tajné kľúče"
