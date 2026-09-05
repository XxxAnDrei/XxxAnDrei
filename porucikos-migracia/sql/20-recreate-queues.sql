-- =============================================================================
-- 20-recreate-queues.sql   —   PGMQ FRONTY NA E-MAILY
-- =============================================================================
-- Spúšťa sa LEN na NOVEJ databáze, PRED restore dát.
--
-- Prečo samostatne: pgmq si fronty spravuje vlastnými tabuľkami (q_* a a_*)
-- a metadátami v pgmq.meta. Obyčajný pg_dump/pg_restore schémy pgmq buď
-- zlyhá, alebo vytvorí tabuľky bez zápisu do pgmq.meta — fronta potom
-- navonok existuje, ale pgmq.send() na nej spadne. Preto sa vytvárajú
-- oficiálnym API a dáta (ak nejaké čakajú) sa dolejú až potom.
--
-- Zachytené zo starej DB 3. 9. 2026:
--   q_auth_emails / a_auth_emails
--   q_transactional_emails / a_transactional_emails
--   q_auth_emails_dlq / a_auth_emails_dlq
--   q_transactional_emails_dlq / a_transactional_emails_dlq
-- =============================================================================

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgmq;

-- pgmq.create() je idempotentné len čiastočne — ošetríme to sami.
DO $$
DECLARE
  q text;
BEGIN
  FOREACH q IN ARRAY ARRAY[
    'auth_emails',
    'auth_emails_dlq',
    'transactional_emails',
    'transactional_emails_dlq'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pgmq.meta WHERE queue_name = q) THEN
      PERFORM pgmq.create(q);
      RAISE NOTICE 'Vytvorená fronta: %', q;
    ELSE
      RAISE NOTICE 'Fronta už existuje, preskakujem: %', q;
    END IF;
  END LOOP;
END $$;

\echo ''
\echo '=== Fronty po nastavení (očakávané 4) ==='
SELECT queue_name, is_partitioned, is_unlogged FROM pgmq.meta ORDER BY queue_name;

-- -----------------------------------------------------------------------------
-- Poznámka k nedoručeným správam
-- -----------------------------------------------------------------------------
-- Ak v čase prepnutia visia v starej fronte neodoslané e-maily, prenes ich
-- ručne AŽ PO restore (na starej DB si ich vypíš, na novej vlož):
--
--   -- na STAREJ:
--   SELECT msg_id, message FROM pgmq.q_transactional_emails ORDER BY msg_id;
--
--   -- na NOVEJ, pre každú správu:
--   SELECT pgmq.send('transactional_emails', '<message ako jsonb>'::jsonb);
--
-- V praxi býva fronta prázdna (dispatch beží každých pár sekúnd), ale
-- pri prepínaní sa to oplatí skontrolovať.
