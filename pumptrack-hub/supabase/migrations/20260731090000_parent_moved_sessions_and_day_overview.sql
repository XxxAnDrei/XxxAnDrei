-- Presuny jazdcov medzi skupinami v rámci dňa – oprava viditeľnosti pre rodičov
-- + prehľad prítomnosti ostatných skupín v danom tréningovom dni.

-- 1) BUG: rodič nevidel tréning, do ktorého bolo jeho dieťa presunuté.
--    Politika "Parents view group sessions" povoľuje len tréningy domovskej
--    skupiny dieťaťa (r.group_id = training_sessions.group_id). Pri presune
--    patrí cieľový tréning inej skupine, takže SELECT vrátil prázdny výsledok
--    a v konte rodiča sa nezobrazilo nič.
DROP POLICY IF EXISTS "Parents view moved-in sessions" ON public.training_sessions;
CREATE POLICY "Parents view moved-in sessions"
ON public.training_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.session_rider_moves m
    WHERE m.session_id = training_sessions.id
      AND m.rider_id IN (SELECT public.my_rider_ids(auth.uid()))
  )
);

-- 2) parent_group_ids() bralo do úvahy len riders.parent_user_id, takže druhý
--    rodič (rider_parents) nevidel spolujazdcov skupiny. Zjednotené s my_rider_ids().
CREATE OR REPLACE FUNCTION public.parent_group_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT r.group_id
  FROM public.riders r
  WHERE r.group_id IS NOT NULL
    AND r.id IN (SELECT public.my_rider_ids(_user_id))
$function$;

-- 3) Prehľad tréningového dňa pre všetky skupiny.
--    Vracia pre každý tréning v daný deň jeho súpisku so stavom prítomnosti,
--    pričom rešpektuje jednorazové presuny (kto je presunutý preč sa odráta,
--    kto je presunutý sem sa pridá ako hosť).
--    SECURITY DEFINER + úzky výstup: rodič sa dostane len k menu jazdca,
--    skupine a príznaku prítomnosti – nie k ostatným stĺpcom tabuľky riders.
CREATE OR REPLACE FUNCTION public.training_day_overview(_date date)
RETURNS TABLE (
  session_id uuid,
  group_id uuid,
  group_name text,
  start_time time without time zone,
  end_time time without time zone,
  location text,
  cancelled boolean,
  coach_name text,
  rider_id uuid,
  rider_name text,
  is_absent boolean,
  is_guest boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH day_sessions AS (
    SELECT s.id AS sid, s.group_id AS gid, g.name AS gname,
           s.start_time AS st, s.end_time AS et, s.location AS loc,
           COALESCE(s.cancelled, false) AS canc, s.coach_name AS coach
    FROM public.training_sessions s
    JOIN public.groups g ON g.id = s.group_id
    WHERE s.session_date = _date
      AND auth.uid() IS NOT NULL
  ),
  day_moves AS (
    SELECT m.rider_id AS rid, m.session_id AS sid
    FROM public.session_rider_moves m
    WHERE m.session_date = _date
  ),
  roster AS (
    -- riadni členovia skupiny, ktorí v tento deň nie sú presunutí inam
    SELECT ds.sid AS sid, r.id AS rid, r.name AS rname, false AS guest
    FROM day_sessions ds
    JOIN public.riders r
      ON r.group_id = ds.gid
     AND r.is_active IS DISTINCT FROM false
    WHERE NOT EXISTS (
      SELECT 1 FROM day_moves dm
      WHERE dm.rid = r.id AND dm.sid <> ds.sid
    )
    UNION ALL
    -- jazdci presunutí do tohto tréningu z inej skupiny
    SELECT ds.sid, r.id, r.name, true
    FROM day_moves dm
    JOIN day_sessions ds ON ds.sid = dm.sid
    JOIN public.riders r
      ON r.id = dm.rid
     AND r.is_active IS DISTINCT FROM false
    WHERE r.group_id IS DISTINCT FROM ds.gid
  )
  SELECT ds.sid, ds.gid, ds.gname, ds.st, ds.et, ds.loc, ds.canc, ds.coach,
         ro.rid, ro.rname,
         (
           EXISTS (
             SELECT 1 FROM public.absences a
             WHERE a.rider_id = ro.rid AND a.session_id = ds.sid
           )
           OR EXISTS (
             SELECT 1 FROM public.attendance att
             WHERE att.rider_id = ro.rid AND att.session_id = ds.sid
               AND att.present = false
           )
         ) AS is_absent,
         ro.guest
  FROM day_sessions ds
  LEFT JOIN roster ro ON ro.sid = ds.sid
  ORDER BY ds.gname, ro.rname;
$function$;

REVOKE ALL ON FUNCTION public.training_day_overview(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.training_day_overview(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.training_day_overview(date) TO authenticated;
