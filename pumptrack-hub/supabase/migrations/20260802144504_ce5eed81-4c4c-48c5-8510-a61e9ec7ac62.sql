CREATE OR REPLACE FUNCTION public.guard_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  _temp_password constant text := convert_from('\x726f6469c48d313233'::bytea, 'UTF8');
BEGIN
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