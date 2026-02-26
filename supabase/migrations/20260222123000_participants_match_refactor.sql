-- Unified participants and match-generation refactor
-- registration_submissions = source of truth
-- participants = derived rows
-- matches = generated rows (participants-based)

-- 0) Ensure match_status supports simplified lifecycle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'match_status'
      AND e.enumlabel = 'completed'
  ) THEN
    ALTER TYPE public.match_status ADD VALUE 'completed';
  END IF;
END $$;

-- Important: do not reference the newly added enum label in this same migration
-- transaction. Data backfill to 'completed' is handled in a follow-up migration.

-- 1) Unified participants table
CREATE TABLE IF NOT EXISTS public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES public.sports_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('team', 'individual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participants_event_sport
  ON public.participants(event_id, sport_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_event_sport_name_type
  ON public.participants(event_id, sport_id, lower(name), type);

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read participants" ON public.participants;
DROP POLICY IF EXISTS "Privileged can mutate participants" ON public.participants;

CREATE POLICY "Authenticated can read participants"
  ON public.participants FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Privileged can mutate participants"
  ON public.participants FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student_coordinator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student_coordinator')
  );

-- 2) Matches table participant columns + direct event/sport columns
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sport_id UUID REFERENCES public.sports_categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS participant_a_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS participant_b_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS winner_participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL;

UPDATE public.matches m
SET
  event_id = es.event_id,
  sport_id = es.sport_category_id
FROM public.event_sports es
WHERE m.event_sport_id = es.id
  AND (m.event_id IS NULL OR m.sport_id IS NULL);

ALTER TABLE public.matches
  ALTER COLUMN round_number SET DEFAULT 1;

UPDATE public.matches
SET round_number = 1
WHERE round_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_matches_event_sport_round
  ON public.matches(event_id, sport_id, round_number);

CREATE INDEX IF NOT EXISTS idx_matches_status_sched
  ON public.matches(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_matches_participants
  ON public.matches(participant_a_id, participant_b_id);

-- 3) Simplify match mutation flow (no coordinator assignment dependency)
DROP TRIGGER IF EXISTS trg_enforce_match_lifecycle_permissions ON public.matches;

DROP POLICY IF EXISTS "Assigned coordinators can create scheduled matches" ON public.matches;
DROP POLICY IF EXISTS "Faculty can create scheduled matches" ON public.matches;
DROP POLICY IF EXISTS "Assigned coordinators can update matches" ON public.matches;
DROP POLICY IF EXISTS "Assigned faculty can finalize or reopen matches" ON public.matches;

CREATE POLICY "Privileged can insert matches"
  ON public.matches FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student_coordinator')
  );

CREATE POLICY "Privileged can update matches"
  ON public.matches FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student_coordinator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student_coordinator')
  );
