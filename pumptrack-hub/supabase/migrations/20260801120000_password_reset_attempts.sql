-- Rate limiting pre obnovenie hesla.
-- Tabuľka je prístupná výhradne service_role (edge funkcia) – RLS je zapnuté
-- a zámerne k nej neexistuje žiadna policy, takže cez anon/authenticated kľúč
-- sa z nej nedá prečítať ani zapísať nič.
CREATE TABLE public.password_reset_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Emaily ani IP neukladáme v čitateľnej podobe, stačí nám ich porovnávať.
  email_hash text NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_attempts_email_idx
  ON public.password_reset_attempts (email_hash, created_at DESC);
CREATE INDEX password_reset_attempts_ip_idx
  ON public.password_reset_attempts (ip_hash, created_at DESC);
CREATE INDEX password_reset_attempts_created_idx
  ON public.password_reset_attempts (created_at);

ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.password_reset_attempts FROM anon, authenticated;
GRANT ALL ON public.password_reset_attempts TO service_role;
