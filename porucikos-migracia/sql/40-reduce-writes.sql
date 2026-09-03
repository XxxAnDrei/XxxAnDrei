-- =============================================================================
-- 40-reduce-writes.sql   —   ZNÍŽENIE ZÁPISOV DO DATABÁZY
-- =============================================================================
-- Rieši druhý zdroj zbytočného rastu — nie cron logy, ale audit trail
-- rezervácií.
--
-- ZISTENIE (namerané 3. 9. 2026 na produkčnej DB):
--   appointment_history má 10 604 riadkov = 3,96 na jednu rezerváciu
--   z toho 4 279 má change_type = 'updated'
--   a z tých 4 279 má  4 268 (99,7 %)  old_values IDENTICKÉ s new_values
--
--   Čiže 40 % audit trailu sú záznamy, ktoré nezaznamenávajú žiadnu zmenu.
--   Zaberajú 1839 kB, čo je ~35 % všetkých reálnych dát aplikácie.
--
-- PREČO VZNIKAJÚ:
--   Trigger log_appointment_change píše pri KAŽDOM UPDATE nad appointments.
--   Aplikácia pritom robí UPDATE aj vtedy, keď len pečiatkuje časy odoslania
--   e-mailov:
--     - created_email_sent_at    (send-email po odoslaní)
--     - confirmed_email_sent_at  (send-email po odoslaní)
--     - reminder_email_sent_at   (send-booking-reminders si takto "claimuje"
--                                 rezerváciu, a pri zlyhaní ju ešte vracia
--                                 späť na NULL — teda dva zápisy)
--   Žiadna z týchto zmien sa netýka sledovaných polí, takže vznikne riadok,
--   kde old_values = new_values. Nulová informačná hodnota.
--
-- Bezpečné spustiť na starej aj novej databáze.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- KROK 1 — trigger prestane zapisovať prázdne zmeny
-- -----------------------------------------------------------------------------
-- Zvyšok funkcie zostáva presne ako bol. Pridaná je len poistka: ak sa
-- ani jedno zo sledovaných polí nezmenilo, zápis sa preskočí.
--
-- Sledované polia: status, start_time, end_time, employee_id, notes.
-- Zmena price alebo internal_notes sa teda nezaloguje — ale ani dnes sa
-- nelogovala, len po nej zostával prázdny riadok. Ak by ste ich chceli
-- sledovať, treba ich pridať do oboch jsonb_build_object nižšie, nie sa
-- spoliehať na tie prázdne riadky.

CREATE OR REPLACE FUNCTION public.log_appointment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  change_type_val TEXT;
  old_vals JSONB;
  new_vals JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    change_type_val := 'created';
    new_vals := to_jsonb(NEW);
    INSERT INTO public.appointment_history (appointment_id, changed_by, change_type, new_values)
    VALUES (NEW.id, auth.uid(), change_type_val, new_vals);

  ELSIF TG_OP = 'UPDATE' THEN
    old_vals := jsonb_build_object(
      'status', OLD.status,
      'start_time', OLD.start_time,
      'end_time', OLD.end_time,
      'employee_id', OLD.employee_id,
      'notes', OLD.notes
    );
    new_vals := jsonb_build_object(
      'status', NEW.status,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time,
      'employee_id', NEW.employee_id,
      'notes', NEW.notes
    );

    -- NOVÉ: nič sledované sa nezmenilo (typicky pečiatka o odoslaní
    -- e-mailu) → nezapisuj prázdny riadok.
    IF old_vals IS NOT DISTINCT FROM new_vals THEN
      RETURN NEW;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      change_type_val := 'status_changed';
    ELSIF OLD.start_time IS DISTINCT FROM NEW.start_time
       OR OLD.end_time IS DISTINCT FROM NEW.end_time THEN
      change_type_val := 'rescheduled';
    ELSIF OLD.employee_id IS DISTINCT FROM NEW.employee_id THEN
      change_type_val := 'reassigned';
    ELSE
      change_type_val := 'updated';
    END IF;

    INSERT INTO public.appointment_history (appointment_id, changed_by, change_type, old_values, new_values)
    VALUES (NEW.id, auth.uid(), change_type_val, old_vals, new_vals);
  END IF;

  RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- KROK 2 — zmazanie už nazbieraných prázdnych záznamov
-- -----------------------------------------------------------------------------
-- Nepovinné. Zmaže ~4 268 riadkov a uvoľní ~1,8 MB.
-- Sú to riadky, ktoré o rezervácii nehovoria nič — old_values sa rovná
-- new_values. Žiadna história sa nimi nestráca.
--
-- Ak chceš byť opatrný, najprv si pozri, čo sa zmaže:
--
--   SELECT count(*) FROM public.appointment_history
--   WHERE change_type = 'updated' AND old_values = new_values;

DELETE FROM public.appointment_history
WHERE change_type = 'updated'
  AND old_values IS NOT NULL
  AND new_values IS NOT NULL
  AND old_values = new_values;

-- Uvoľnenie miesta. Bez FULL, takže tabuľku nezamyká.
VACUUM (ANALYZE) public.appointment_history;

-- -----------------------------------------------------------------------------
-- Kontrola
-- -----------------------------------------------------------------------------
\echo ''
\echo '=== Audit trail po úprave ==='
SELECT change_type, count(*) AS zaznamov,
       count(*) FILTER (WHERE old_values = new_values) AS prazdnych
FROM public.appointment_history
GROUP BY change_type
ORDER BY zaznamov DESC;

\echo ''
\echo '=== Záznamov na jednu rezerváciu (pred úpravou 3,96) ==='
SELECT round(
  (SELECT count(*) FROM public.appointment_history)::numeric
  / NULLIF((SELECT count(*) FROM public.appointments), 0), 2) AS na_rezervaciu;
