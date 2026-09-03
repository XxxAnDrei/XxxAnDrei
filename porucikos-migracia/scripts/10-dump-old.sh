#!/usr/bin/env bash
# =============================================================================
# 10-dump-old.sh   —   ZÁLOHA STAREJ (LOVABLE CLOUD) DATABÁZY
# =============================================================================
# LEN NA ČÍTANIE. Nič v starej databáze nemení.
# Dá sa pustiť koľkokoľvek krát — pokojne aj nanečisto cez deň.
#
# Predpoklady:
#   - Supabase CLI      (npm i -g supabase   /   brew install supabase/tap/supabase)
#   - psql 17+
#   - Docker Desktop    (supabase db dump beží v kontajneri)
#
# Connection string starej DB nájdeš v Lovable:
#   projekt → Cloud → Database → Connection string  (Session pooler)
#   Heslo sa dá resetnúť tamtiež.
#
# Použitie:
#   export OLD_DB_URL='postgresql://postgres.csteuzcbybwfwxmjmkjb:HESLO@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
#   ./scripts/10-dump-old.sh
# =============================================================================
set -euo pipefail

: "${OLD_DB_URL:?Nastav OLD_DB_URL (connection string starej databázy)}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${OUT_DIR:-./dump-$STAMP}"
mkdir -p "$OUT"

echo "==> Zálohujem do adresára: $OUT"
echo "    (stará DB sa týmto NIJAK nemení)"
echo

# -----------------------------------------------------------------------------
# 1) Roly
# -----------------------------------------------------------------------------
echo "==> [1/5] Roly (roles.sql)"
supabase db dump --db-url "$OLD_DB_URL" -f "$OUT/roles.sql" --role-only

# -----------------------------------------------------------------------------
# 2) Schéma
#    supabase db dump zámerne vynecháva schémy auth a storage — tie už nový
#    projekt má vlastné. Vynecháva aj schémy z rozšírení (cron, pgmq, net).
# -----------------------------------------------------------------------------
echo "==> [2/5] Schéma (schema.sql)"
supabase db dump --db-url "$OLD_DB_URL" -f "$OUT/schema.sql"

# -----------------------------------------------------------------------------
# 3) Dáta — vrátane auth.users a auth.identities
#    Toto je to podstatné: heslá sa prenášajú ako hashe, takže ľudia
#    nemusia nič resetovať. Vylúčené sú len interné storage vektorové
#    tabuľky, ktoré restore rozbíjajú.
# -----------------------------------------------------------------------------
echo "==> [3/5] Dáta (data.sql)"
supabase db dump --db-url "$OLD_DB_URL" -f "$OUT/data.sql" \
  --use-copy --data-only \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes"

# -----------------------------------------------------------------------------
# 3b) Poistka na auth účty
#
#     Dokumentácia Supabase si v tomto protirečí: `supabase db dump` opisuje
#     schému auth ako vylúčenú, ale odporúčaný postup obnovy s ňou počíta.
#     Namiesto hádania to overíme a v prípade potreby doplníme obyčajným
#     pg_dump. Bez auth.users by sa po prepnutí neprihlásil nikto.
# -----------------------------------------------------------------------------
if grep -qE 'COPY "?auth"?\."?users"?' "$OUT/data.sql"; then
  echo "==> [3b/5] auth.users je v data.sql — doplnkový dump netreba"
else
  echo "==> [3b/5] auth.users v data.sql CHÝBA — dopĺňam cez pg_dump"
  pg_dump "$OLD_DB_URL" \
    --data-only --column-inserts --no-owner --no-privileges \
    --schema=auth \
    --exclude-table='auth.schema_migrations' \
    -f "$OUT/auth_data.sql"

  grep -qE 'INSERT INTO auth\.users' "$OUT/auth_data.sql" || {
    echo "    !!! Ani doplnkový dump neobsahuje auth.users. Nepokračuj."
    exit 1
  }
  echo "    OK — auth účty uložené v auth_data.sql"
fi

# -----------------------------------------------------------------------------
# 4) História migrácií (nepovinné, ale hodí sa)
# -----------------------------------------------------------------------------
echo "==> [4/5] História migrácií"
supabase db dump --db-url "$OLD_DB_URL" -f "$OUT/history_schema.sql" \
  --schema supabase_migrations
supabase db dump --db-url "$OLD_DB_URL" -f "$OUT/history_data.sql" \
  --use-copy --data-only --schema supabase_migrations

# -----------------------------------------------------------------------------
# 5) Odtlačok pre neskoršie porovnanie
# -----------------------------------------------------------------------------
echo "==> [5/5] Odtlačok schémy a dát (fingerprint-old.txt)"
psql "$OLD_DB_URL" -f "$(dirname "$0")/../sql/10-fingerprint.sql" \
  > "$OUT/fingerprint-old.txt" 2>&1

# -----------------------------------------------------------------------------
# Zhrnutie
# -----------------------------------------------------------------------------
echo
echo "==> Hotovo. Obsah zálohy:"
ls -lh "$OUT"
echo
echo "==> Kontrola: účty podľa poskytovateľa (očakávané 105 google / 82 email)"
psql "$OLD_DB_URL" -At -c \
  "SELECT provider || ': ' || count(*) FROM auth.identities GROUP BY provider ORDER BY provider;"

echo
echo "Ďalší krok: scripts/20-restore-new.sh  (s OUT_DIR=$OUT)"
