-- Registration flow update:
-- - registration_submissions is source of truth
-- - approvals are not required
-- - teams are derived at match-generation time in app logic

-- 1) Make submissions auto-valid by default
ALTER TABLE public.registration_submissions
  ALTER COLUMN status SET DEFAULT 'approved';

UPDATE public.registration_submissions
SET status = 'approved'
WHERE status = 'pending';

-- Keep relational sync trigger aligned with auto-valid submissions.
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
    NEW.status := 'approved';
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Remove approval-triggered team creation/linking
DROP TRIGGER IF EXISTS trg_create_or_link_team_on_submission_approval ON public.registration_submissions;
DROP FUNCTION IF EXISTS public.create_or_link_team_on_submission_approval();

-- 3) Let coordinators read all matches (including scheduled) without assignment filters
DROP POLICY IF EXISTS "Authenticated can read matches by role" ON public.matches;

CREATE POLICY "Authenticated can read matches by role"
  ON public.matches FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student')
    OR public.has_role(auth.uid(), 'student_coordinator')
  );
