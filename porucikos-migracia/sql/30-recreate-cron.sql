-- =============================================================================
-- 30-recreate-cron.sql   —   ZNOVUVYTVORENIE CRON ÚLOH NA NOVEJ DATABÁZE
-- =============================================================================
-- Spúšťa sa LEN na NOVEJ databáze, až po restore dát.
--
-- !!! PRED SPUSTENÍM VYPLŇ DVE HODNOTY NIŽŠIE !!!
--   :new_project_ref  — ref nového Supabase projektu (napr. abcdefghijklmnop)
--   :new_anon_key     — anon / publishable key nového projektu
--
-- Spustenie:
--   psql "$NEW_DB_URL" \
--     -v new_project_ref='XXXXXXXXXXXXXXXX' \
--     -v new_anon_key='eyJhbGciOi...' \
--     -f sql/30-recreate-cron.sql
--
-- Pôvodné definície zachytené zo starej DB 3. 9. 2026 — zámerne zapísané
-- doslovne, aby sa dalo overiť, že sa nič nestratilo.
-- =============================================================================

\set ON_ERROR_STOP on

-- Poistka: bez vyplnených premenných to nemá zmysel púšťať.
\if :{?new_project_ref}
\else
  \echo 'CHYBA: chýba -v new_project_ref=...'
  \quit
\endif
\if :{?new_anon_key}
\else
  \echo 'CHYBA: chýba -v new_anon_key=...'
  \quit
\endif

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotencia: ak už existujú, zmaž a vytvor nanovo.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('auto-complete-appointments',
                  'send-booking-reminders-15min',
                  'purge-cron-history');

-- -----------------------------------------------------------------------------
-- POZNÁMKA K FREKVENCIÁM
--
-- Na starej DB bežali tieto úlohy každých 5 a 15 minút = 384 behov denne.
-- Nižšie sú zámerne spomalené na 15 a 30 minút = 144 behov denne (-62 %),
-- pretože ani jedna z nich rýchlejší takt nepotrebuje:
--
--   auto_complete_appointments — len označí rezervácie po skončení ako
--     'completed'. Či sa to stane 5 alebo 15 minút po termíne, nikto
--     nespozná; v admin kalendári to nie je viditeľný rozdiel.
--
--   send-booking-reminders — hľadá rezervácie v okne [teraz+23h, teraz+25h],
--     teda 2 hodiny široké. Komentár priamo v tej funkcii hovorí "2h padding
--     so we always catch them at the next cron tick". Pri takte 30 minút
--     zostáva 4-násobná rezerva. Aj hodinový takt by bol bezpečný.
--
-- Ak by si chcel pôvodné hodnoty, staré rozvrhy boli '*/5 * * * *'
-- a '*/15 * * * *'.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1) auto-complete-appointments  —  každých 15 minút
--    Uzatvára rezervácie, ktorým už uplynul čas. Čisté SQL, žiadne URL.
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'auto-complete-appointments',
  '*/15 * * * *',
  'SELECT public.auto_complete_appointments()'
);

-- -----------------------------------------------------------------------------
-- 2) send-booking-reminders-15min  —  každých 30 minút
--    Volá edge funkciu, ktorá posiela pripomienky 24 h pred termínom.
--    Názov úlohy ponechaný kvôli spätnej dohľadateľnosti.
--    TU JE ZAKÓDOVANÉ PROJECT REF AJ ANON KEY — preto sa dosadzujú premenné.
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'send-booking-reminders-15min',
  '*/30 * * * *',
  format($job$
  SELECT net.http_post(
    url := 'https://%s.supabase.co/functions/v1/send-booking-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer %s'
    ),
    body := jsonb_build_object('source', 'pg_cron')
  );
  $job$, :'new_project_ref', :'new_anon_key')
);

-- -----------------------------------------------------------------------------
-- 3) purge-cron-history  —  NOVÁ úloha, denne o 3:00
--    Toto na starej DB chýbalo a preto tam narástlo 1,5 GB odpadu.
--    Nechávame 7 dní histórie — na ladenie bohato stačí.
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'purge-cron-history',
  '0 3 * * *',
  $purge$
  DELETE FROM cron.job_run_details
  WHERE start_time < now() - interval '7 days'
  $purge$
);

-- -----------------------------------------------------------------------------
-- Kontrola
-- -----------------------------------------------------------------------------
\echo ''
\echo '=== Cron úlohy po nastavení (očakávané 3, všetky active=t) ==='
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;

\echo ''
\echo 'SKONTROLUJ RUČNE, že v send-booking-reminders-15min je NOVÉ ref a NOVÝ key:'
SELECT command FROM cron.job WHERE jobname = 'send-booking-reminders-15min';
