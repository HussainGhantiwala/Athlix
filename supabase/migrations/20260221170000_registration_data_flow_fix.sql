-- ================================================================
-- REGISTRATION DATA FLOW FIX
-- ================================================================

-- 1) Extend teams with direct event/sport references (derived from event_sport_id)
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS event_id UUID,
  ADD COLUMN IF NOT EXISTS sport_id UUID;

UPDATE public.teams t
SET
  event_id = es.event_id,
  sport_id = es.sport_category_id
FROM public.event_sports es
WHERE es.id = t.event_sport_id
  AND (t.event_id IS NULL OR t.sport_id IS NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teams_event_id_fkey'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teams_sport_id_fkey'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_sport_id_fkey
      FOREIGN KEY (sport_id) REFERENCES public.sports_categories(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_team_event_sport_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_sport_id IS NOT NULL THEN
    SELECT es.event_id, es.sport_category_id
    INTO NEW.event_id, NEW.sport_id
    FROM public.event_sports es
    WHERE es.id = NEW.event_sport_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_event_sport_fields ON public.teams;
CREATE TRIGGER trg_sync_team_event_sport_fields
  BEFORE INSERT OR UPDATE OF event_sport_id ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_team_event_sport_fields();

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_unique_event_sport_name
  ON public.teams (event_sport_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_teams_event_id ON public.teams(event_id);
CREATE INDEX IF NOT EXISTS idx_teams_sport_id ON public.teams(sport_id);

-- 2) Extend registration_submissions with relational fields + status
ALTER TABLE public.registration_submissions
  ADD COLUMN IF NOT EXISTS event_id UUID,
  ADD COLUMN IF NOT EXISTS sport_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS status public.registration_status DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

UPDATE public.registration_submissions rs
SET user_id = rs.submitted_by
WHERE rs.user_id IS NULL
  AND rs.submitted_by IS NOT NULL;

UPDATE public.registration_submissions rs
SET
  event_id = rf.event_id,
  sport_id = rf.sport_id
FROM public.registration_forms rf
WHERE rf.id = rs.form_id
  AND (rs.event_id IS NULL OR rs.sport_id IS NULL);

UPDATE public.registration_submissions
SET status = 'pending'
WHERE status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_submissions_event_id_fkey'
  ) THEN
    ALTER TABLE public.registration_submissions
      ADD CONSTRAINT registration_submissions_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_submissions_sport_id_fkey'
  ) THEN
    ALTER TABLE public.registration_submissions
      ADD CONSTRAINT registration_submissions_sport_id_fkey
      FOREIGN KEY (sport_id) REFERENCES public.sports_categories(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_submissions_user_id_fkey'
  ) THEN
    ALTER TABLE public.registration_submissions
      ADD CONSTRAINT registration_submissions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_submissions_team_id_fkey'
  ) THEN
    ALTER TABLE public.registration_submissions
      ADD CONSTRAINT registration_submissions_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registration_submissions_reviewed_by_fkey'
  ) THEN
    ALTER TABLE public.registration_submissions
      ADD CONSTRAINT registration_submissions_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.registration_submissions
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN event_id SET NOT NULL,
  ALTER COLUMN sport_id SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_submissions_event_status
  ON public.registration_submissions(event_id, status);

CREATE INDEX IF NOT EXISTS idx_registration_submissions_sport_status
  ON public.registration_submissions(sport_id, status);

CREATE INDEX IF NOT EXISTS idx_registration_submissions_user_status
  ON public.registration_submissions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_registration_submissions_team_id
  ON public.registration_submissions(team_id);

CREATE OR REPLACE FUNCTION public.sync_submission_relational_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.form_id IS NOT NULL AND (NEW.event_id IS NULL OR NEW.sport_id IS NULL) THEN
    SELECT rf.event_id, rf.sport_id
    INTO NEW.event_id, NEW.sport_id
    FROM public.registration_forms rf
    WHERE rf.id = NEW.form_id;
  END IF;

  IF NEW.user_id IS NULL THEN
    NEW.user_id := NEW.submitted_by;
  END IF;

  IF NEW.submitted_by IS NULL THEN
    NEW.submitted_by := NEW.user_id;
  END IF;

  IF NEW.status IS NULL THEN
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_submission_relational_fields ON public.registration_submissions;
CREATE TRIGGER trg_sync_submission_relational_fields
  BEFORE INSERT OR UPDATE ON public.registration_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_submission_relational_fields();

-- 3) Auto-create/link team on approval for team-based forms
CREATE OR REPLACE FUNCTION public.create_or_link_team_on_submission_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _form_type TEXT;
  _event_sport_id UUID;
  _team_id UUID;
BEGIN
  IF NOT (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved') THEN
    RETURN NEW;
  END IF;

  IF NEW.team_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT rf.type
  INTO _form_type
  FROM public.registration_forms rf
  WHERE rf.id = NEW.form_id;

  IF COALESCE(_form_type, 'individual') <> 'team' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(trim(NEW.team_name), '') = '' THEN
    RETURN NEW;
  END IF;

  SELECT es.id
  INTO _event_sport_id
  FROM public.event_sports es
  WHERE es.event_id = NEW.event_id
    AND es.sport_category_id = NEW.sport_id
  ORDER BY es.created_at
  LIMIT 1;

  IF _event_sport_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.id
  INTO _team_id
  FROM public.teams t
  WHERE t.event_sport_id = _event_sport_id
    AND lower(t.name) = lower(NEW.team_name)
  LIMIT 1;

  IF _team_id IS NULL THEN
    INSERT INTO public.teams (
      name,
      event_sport_id,
      event_id,
      sport_id,
      created_by,
      status,
      approved_by,
      approved_at
    )
    VALUES (
      NEW.team_name,
      _event_sport_id,
      NEW.event_id,
      NEW.sport_id,
      NEW.user_id,
      'approved',
      auth.uid(),
      now()
    )
    RETURNING id INTO _team_id;
  END IF;

  UPDATE public.registration_submissions
  SET team_id = _team_id
  WHERE id = NEW.id;

  INSERT INTO public.team_members (team_id, user_id, is_captain, position)
  VALUES (_team_id, NEW.user_id, true, 'Captain')
  ON CONFLICT (team_id, user_id) DO UPDATE
  SET is_captain = EXCLUDED.is_captain;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_or_link_team_on_submission_approval ON public.registration_submissions;
CREATE TRIGGER trg_create_or_link_team_on_submission_approval
  AFTER UPDATE ON public.registration_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.create_or_link_team_on_submission_approval();

-- 4) RLS for registration_submissions
ALTER TABLE public.registration_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can submit registrations" ON public.registration_submissions;
DROP POLICY IF EXISTS "View registration submissions" ON public.registration_submissions;
DROP POLICY IF EXISTS "Users can view own submissions or coordinators/admin can view all" ON public.registration_submissions;
DROP POLICY IF EXISTS "Authenticated users can submit" ON public.registration_submissions;

CREATE POLICY "Students can view own registration submissions"
  ON public.registration_submissions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
  );

CREATE POLICY "Admins can view all registration submissions"
  ON public.registration_submissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Faculty can view all registration submissions"
  ON public.registration_submissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'faculty'));

CREATE POLICY "Assigned coordinators can view registration submissions"
  ON public.registration_submissions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'student_coordinator')
    AND EXISTS (
      SELECT 1
      FROM public.coordinator_assignments ca
      WHERE ca.event_id = registration_submissions.event_id
        AND ca.user_id = auth.uid()
    )
  );

CREATE POLICY "Students can insert own registration submissions"
  ON public.registration_submissions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND submitted_by = auth.uid()
  );

CREATE POLICY "Faculty can review registration submissions"
  ON public.registration_submissions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'faculty'))
  WITH CHECK (public.has_role(auth.uid(), 'faculty'));

CREATE POLICY "Admins can review registration submissions"
  ON public.registration_submissions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Assigned coordinators can review registration submissions"
  ON public.registration_submissions FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'student_coordinator')
    AND EXISTS (
      SELECT 1
      FROM public.coordinator_assignments ca
      WHERE ca.event_id = registration_submissions.event_id
        AND ca.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'student_coordinator')
    AND EXISTS (
      SELECT 1
      FROM public.coordinator_assignments ca
      WHERE ca.event_id = registration_submissions.event_id
        AND ca.user_id = auth.uid()
    )
  );

-- 5) Match read policies: coordinator reads assigned matches, students read-only, admin/faculty read-all
DROP POLICY IF EXISTS "Public can read matches" ON public.matches;

DROP POLICY IF EXISTS "Anon can read matches" ON public.matches;
DROP POLICY IF EXISTS "Authenticated can read matches by role" ON public.matches;

CREATE POLICY "Anon can read matches"
  ON public.matches FOR SELECT TO anon
  USING (true);

CREATE POLICY "Authenticated can read matches by role"
  ON public.matches FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student')
    OR (
      public.has_role(auth.uid(), 'student_coordinator')
      AND public.is_match_assigned(auth.uid(), id, 'student_coordinator')
    )
  );

-- Keep realtime streamable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'registration_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.registration_submissions;
  END IF;
END $$;
