-- Vynútenú zmenu hesla si používateľ vedel zhodiť sám.
--
-- Politiky "Users update own profile" a "Users can update own must_change_password"
-- dovoľujú aktualizovať vlastný riadok v profiles vrátane stĺpca
-- must_change_password. Kto vie, ako aplikácia komunikuje s API, si teda vedel
-- príznak nastaviť na false a prejsť do aplikácie bez zmeny dočasného hesla:
--
--   supabase.from('profiles').update({ must_change_password: false }).eq('id', <moje id>)
--
-- Príznak sa preto smie zhodiť až vtedy, keď účet reálne nemá dočasné heslo.
-- Trigger beží ako SECURITY DEFINER, lebo bežný používateľ do auth.users nevidí.

CREATE OR REPLACE FUNCTION public.guard_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  _temp_password constant text := convert_from('\x726f6469c48d313233'::bytea, 'UTF8'); -- rodič123
BEGIN
  -- Admin (a service_role, ktorý beží mimo RLS) môže príznak nastaviť ľubovoľne.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF OLD.must_change_password AND NOT COALESCE(NEW.must_change_password, false) THEN
    IF EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = NEW.id
        AND u.encrypted_password = extensions.crypt(_temp_password, u.encrypted_password)
    ) THEN
      RAISE EXCEPTION 'Najprv si nastavte vlastné heslo.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_must_change_password ON public.profiles;
CREATE TRIGGER guard_must_change_password
  BEFORE UPDATE OF must_change_password ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_must_change_password();
