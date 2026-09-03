-- =============================================================================
-- 10-fingerprint.sql   —   ODTLAČOK SCHÉMY A DÁT
-- =============================================================================
-- Spusti na STAREJ aj NOVEJ databáze a porovnaj výstupy. Musia sedieť riadok
-- po riadku (okrem počtu riadkov v tabuľkách, ktorý na starej medzitým rastie).
--
-- Použitie:
--   psql "$OLD_DB_URL" -f sql/10-fingerprint.sql > /tmp/fp-old.txt
--   psql "$NEW_DB_URL" -f sql/10-fingerprint.sql > /tmp/fp-new.txt
--   diff /tmp/fp-old.txt /tmp/fp-new.txt
--
-- LEN NA ČÍTANIE. Nič nemení.
-- =============================================================================

\pset pager off
\pset format aligned

\echo '=== 1. TABUĽKY A POČTY RIADKOV ==============================='
-- Očakávaných 16 tabuliek v public.
SELECT relname AS tabulka,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM public.%I', relname),
                           false, true, '')))[1]::text::bigint AS riadkov
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY relname;

\echo ''
\echo '=== 2. STĹPCE (názov, typ, nullability, default) ============='
SELECT table_name, ordinal_position, column_name, data_type,
       is_nullable, coalesce(column_default, '-') AS default_hodnota
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

\echo ''
\echo '=== 3. RLS — zapnutie a počet politík ======================='
-- Očakávané: všetkých 16 tabuliek rls=true, spolu 52 politík.
SELECT c.relname AS tabulka,
       c.relrowsecurity AS rls_zapnute,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politik
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

\echo ''
\echo '=== 4. RLS — plné definície politík ========================='
-- Toto je najdôležitejšia časť. Jediný rozdiel tu = diera v zabezpečení.
SELECT tablename, policyname, permissive, roles::text, cmd,
       coalesce(qual, '-')       AS using_vyraz,
       coalesce(with_check, '-') AS with_check_vyraz
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

\echo ''
\echo '=== 5. FUNKCIE (19 očakávaných) ============================='
SELECT p.proname AS funkcia,
       pg_get_function_identity_arguments(p.oid) AS argumenty,
       p.prosecdef AS security_definer,
       md5(p.prosrc) AS hash_tela
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, argumenty;

\echo ''
\echo '=== 6. TRIGGERY (10 očakávaných) ==========================='
SELECT event_object_table AS tabulka, trigger_name, action_timing,
       event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name, event_manipulation;

\echo ''
\echo '=== 7. ENUM TYPY (app_role) ================================'
SELECT t.typname AS enum_nazov,
       string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS hodnoty
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

\echo ''
\echo '=== 8. INDEXY ==============================================='
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

\echo ''
\echo '=== 9. CUDZIE KĽÚČE A OBMEDZENIA ==========================='
SELECT conrelid::regclass::text AS tabulka,
       conname AS obmedzenie,
       contype AS typ,          -- p=primary, f=foreign, u=unique, c=check
       pg_get_constraintdef(oid) AS definicia
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY tabulka, obmedzenie;

\echo ''
\echo '=== 10. AUTH — účty podľa poskytovateľa ===================='
-- Očakávané pred migráciou: 180 účtov, 105 google, 82 email.
-- Po restore musia sedieť PRESNE, inak sa niekto neprihlási.
SELECT provider, count(*) AS uctov
FROM auth.identities
GROUP BY provider
ORDER BY provider;

SELECT count(*) AS uzivatelov_spolu,
       count(*) FILTER (WHERE encrypted_password IS NOT NULL) AS s_heslom,
       count(*) FILTER (WHERE email_confirmed_at IS NOT NULL) AS potvrdeny_email
FROM auth.users;

\echo ''
\echo '=== 11. STORAGE — buckety a súbory ========================='
-- Očakávané: employee-avatars (12 súborov), email-assets (1 súbor).
-- pg_dump toto NEPRENESIE — súbory sa kopírujú samostatne.
SELECT b.id AS bucket, b.public AS verejny, count(o.id) AS suborov,
       coalesce(sum((o.metadata->>'size')::bigint), 0) AS bajtov
FROM storage.buckets b
LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.id, b.public
ORDER BY b.id;

\echo ''
\echo '=== 12. PGMQ FRONTY ========================================'
-- Očakávané 2 fronty + 2 DLQ. Vytvárajú sa cez pgmq.create(), nie cez dump.
SELECT queue_name, is_partitioned, is_unlogged
FROM pgmq.meta
ORDER BY queue_name;

\echo ''
\echo '=== 13. ROZŠÍRENIA ========================================='
-- Očakávané: pg_cron, pg_net, pgmq, pgcrypto, uuid-ossp, supabase_vault,
--            pg_stat_statements, plpgsql
SELECT extname, extversion FROM pg_extension ORDER BY extname;

\echo ''
\echo '=== 14. CRON ÚLOHY ========================================='
-- Na novej DB musia byť 2 aktívne (+ prípadne purge-cron-history).
-- POZOR: v command musí byť NOVÉ project ref a NOVÝ anon key.
SELECT jobid, jobname, schedule, active, command
FROM cron.job
ORDER BY jobid;

\echo ''
\echo '=== KONIEC ODTLAČKU ========================================'
