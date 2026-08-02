-- Odpoveď na udalosť má tri stavy: zúčastníme sa / možno / nezúčastníme sa.
-- Doteraz bol len boolean `attending` a "nezúčastníme sa" sa vyjadrovalo
-- zmazaním riadku, takže sa nedalo odlíšiť "povedal nie" od "nevyjadril sa".

ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS response text NOT NULL DEFAULT 'yes';

UPDATE public.event_rsvps
SET response = CASE WHEN attending THEN 'yes' ELSE 'no' END
WHERE response NOT IN ('yes', 'maybe', 'no');

ALTER TABLE public.event_rsvps DROP CONSTRAINT IF EXISTS event_rsvps_response_check;
ALTER TABLE public.event_rsvps
  ADD CONSTRAINT event_rsvps_response_check CHECK (response IN ('yes', 'maybe', 'no'));

-- `attending` ponechávame, lebo ho číta admin prehľad tréningov. Držíme ho
-- v súlade s `response`, aby sa obe hodnoty nemohli rozísť.
CREATE OR REPLACE FUNCTION public.sync_rsvp_attending()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.attending := (NEW.response = 'yes');
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_rsvp_attending ON public.event_rsvps;
CREATE TRIGGER sync_rsvp_attending
  BEFORE INSERT OR UPDATE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.sync_rsvp_attending();

-- Jedna odpoveď na používateľa a udalosť, nech sa dá robiť upsert.
-- Prípadné historické duplicity zlúčime na najnovší záznam.
DELETE FROM public.event_rsvps a
USING public.event_rsvps b
WHERE a.event_id = b.event_id
  AND a.user_id = b.user_id
  AND (a.created_at, a.id) < (b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS event_rsvps_event_user_uidx
  ON public.event_rsvps (event_id, user_id);

-- Kto sa ako vyjadril. Mená jazdcov sú za RLS (rodič vidí len svoju skupinu),
-- takže ich vraciame cez SECURITY DEFINER s úzkym výstupom: meno, skupina
-- a odpoveď. Samotné odpovede už čítať smie každý prihlásený.
CREATE OR REPLACE FUNCTION public.event_responses(_event_id uuid)
RETURNS TABLE (
  rider_id uuid,
  rider_name text,
  group_name text,
  parent_name text,
  response text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.id, r.name, g.name, p.full_name, e.response
  FROM public.event_rsvps e
  LEFT JOIN LATERAL unnest(e.rider_ids) AS u(rid) ON true
  LEFT JOIN public.riders r ON r.id = u.rid
  LEFT JOIN public.groups g ON g.id = r.group_id
  LEFT JOIN public.profiles p ON p.id = e.user_id
  WHERE e.event_id = _event_id
    AND auth.uid() IS NOT NULL
  ORDER BY r.name NULLS LAST, p.full_name;
$function$;

REVOKE ALL ON FUNCTION public.event_responses(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_responses(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.event_responses(uuid) TO authenticated;
