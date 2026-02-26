-- Simplify match generation storage:
-- direct participant names on matches sourced from registration_submissions.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sport_id UUID REFERENCES public.sports_categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS participant_a_name TEXT,
  ADD COLUMN IF NOT EXISTS participant_b_name TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT now();

DO $$
DECLARE
  _round_type TEXT;
BEGIN
  SELECT data_type
  INTO _round_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'matches'
    AND column_name = 'round';

  IF _round_type IS NULL THEN
    ALTER TABLE public.matches
      ADD COLUMN round INTEGER DEFAULT 1;
  ELSIF _round_type <> 'integer' THEN
    ALTER TABLE public.matches
      ALTER COLUMN round TYPE INTEGER
      USING (
        CASE
          WHEN trim(round::text) ~ '^[0-9]+$' THEN trim(round::text)::integer
          ELSE 1
        END
      );

    ALTER TABLE public.matches
      ALTER COLUMN round SET DEFAULT 1;
  ELSE
    ALTER TABLE public.matches
      ALTER COLUMN round SET DEFAULT 1;
  END IF;
END $$;

-- Keep status default aligned with schedule-first flow.
ALTER TABLE public.matches
  ALTER COLUMN status SET DEFAULT 'scheduled';

-- Backfill names for existing rows when possible.
UPDATE public.matches m
SET participant_a_name = COALESCE(m.participant_a_name, t.name)
FROM public.teams t
WHERE m.team_a_id = t.id
  AND m.participant_a_name IS NULL;

UPDATE public.matches m
SET participant_b_name = COALESCE(m.participant_b_name, t.name)
FROM public.teams t
WHERE m.team_b_id = t.id
  AND m.participant_b_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_matches_event_sport_status_sched
  ON public.matches(event_id, sport_id, status, scheduled_at);

