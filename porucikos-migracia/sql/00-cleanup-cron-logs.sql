-- =============================================================================
-- 00-cleanup-cron-logs.sql   —   UPRATANIE 1,5 GB ODPADU
-- =============================================================================
-- Nezávislé od migrácie. Dá sa pustiť na STAREJ databáze hneď a ušetrí
-- kredity, aj keby k presunu nakoniec nedošlo.
--
-- ČO SA NEMENÍ:
--   - tabuľka cron.job (definície úloh) — pripomienky bežia ďalej
--   - žiadne aplikačné dáta
--
-- ČO SA MENÍ:
--   - cron.job_run_details — história spustení, staršia ako 7 dní
--
-- Stav pred spustením (namerané 25. 8. 2026):
--   cron.job_run_details = 1529 MB / ~784 000 riadkov
--   celá DB              = 1554 MB
--   reálne dáta          = 5,3 MB
-- =============================================================================

\set ON_ERROR_STOP on
\timing on

\echo '=== PRED: veľkosť databázy a log tabuľky ==='
SELECT pg_size_pretty(pg_database_size(current_database())) AS cela_db,
       pg_size_pretty(pg_total_relation_size('cron.job_run_details')) AS log_tabulka;

-- -----------------------------------------------------------------------------
-- KROK 1 — zmazanie starých záznamov
-- -----------------------------------------------------------------------------
-- Opatrnejší variant: najprv '30 days', overiť že druhý deň všetko beží,
-- a až potom dotiahnuť na '7 days'.
DELETE FROM cron.job_run_details
WHERE start_time < now() - interval '7 days';

\echo '=== PO DELETE (miesto sa ešte neuvoľnilo — mŕtve riadky) ==='
SELECT pg_size_pretty(pg_total_relation_size('cron.job_run_details')) AS log_tabulka;

-- -----------------------------------------------------------------------------
-- KROK 2 — fyzické uvoľnenie miesta
-- -----------------------------------------------------------------------------
-- VACUUM FULL prepíše tabuľku a vráti miesto OS. Zamkne cron.job_run_details
-- na niekoľko sekúnd až minút. Cron úlohy sa medzitým len nezapíšu do logu,
-- samotné spustenie tým neprepadne.
-- Púšťaj mimo špičky (ideálne 02:00–05:00).
VACUUM FULL cron.job_run_details;

\echo '=== PO: veľkosť databázy a log tabuľky ==='
SELECT pg_size_pretty(pg_database_size(current_database())) AS cela_db,
       pg_size_pretty(pg_total_relation_size('cron.job_run_details')) AS log_tabulka;

-- -----------------------------------------------------------------------------
-- KROK 3 — aby to znovu nenarástlo
-- -----------------------------------------------------------------------------
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-cron-history';

SELECT cron.schedule(
  'purge-cron-history',
  '0 3 * * *',
  $purge$
  DELETE FROM cron.job_run_details
  WHERE start_time < now() - interval '7 days'
  $purge$
);

\echo ''
\echo '=== KONTROLA: cron úlohy musia byť 3 a všetky aktívne ==='
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
