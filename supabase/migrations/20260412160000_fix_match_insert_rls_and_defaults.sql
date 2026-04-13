ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS matches_university_id_idx
  ON public.matches (university_id);

UPDATE public.matches m
SET event_id = es.event_id
FROM public.event_sports es
WHERE es.id = m.event_sport_id
  AND m.event_id IS NULL;

UPDATE public.matches m
SET university_id = e.university_id
FROM public.events e
WHERE e.id = COALESCE(
  m.event_id,
  (
    SELECT es.event_id
    FROM public.event_sports es
    WHERE es.id = m.event_sport_id
    LIMIT 1
  )
)
  AND m.university_id IS DISTINCT FROM e.university_id;

CREATE OR REPLACE FUNCTION public.set_match_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_id UUID;
BEGIN
  IF NEW.event_sport_id IS NOT NULL AND NEW.event_id IS NULL THEN
    SELECT es.event_id
    INTO _event_id
    FROM public.event_sports es
    WHERE es.id = NEW.event_sport_id;

    NEW.event_id := COALESCE(NEW.event_id, _event_id);
  END IF;

  IF NEW.university_id IS NULL AND NEW.event_id IS NOT NULL THEN
    SELECT e.university_id
    INTO NEW.university_id
    FROM public.events e
    WHERE e.id = NEW.event_id;
  END IF;

  IF NEW.university_id IS NULL THEN
    NEW.university_id := public.current_user_university_id(auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_match_defaults ON public.matches;

CREATE TRIGGER set_match_defaults
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_match_defaults();

DROP POLICY IF EXISTS "tenant_matches_insert_same_university" ON public.matches;

CREATE POLICY "tenant_matches_insert_same_university"
  ON public.matches FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      university_id = (
        SELECT p.university_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
      )
      AND university_id IS NOT NULL
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
      AND public.can_access_event(COALESCE(
        event_id,
        (
          SELECT es.event_id
          FROM public.event_sports es
          WHERE es.id = event_sport_id
          LIMIT 1
        )
      ))
    )
  );
