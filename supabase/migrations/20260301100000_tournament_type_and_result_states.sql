-- Tournament control columns and result-state support

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS tournament_type TEXT DEFAULT 'knockout';

UPDATE public.events
SET tournament_type = 'knockout'
WHERE tournament_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_tournament_type_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_tournament_type_check
      CHECK (tournament_type IN ('group', 'knockout', 'league'));
  END IF;
END $$;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS result TEXT DEFAULT 'pending';

UPDATE public.matches
SET result = 'pending'
WHERE result IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_phase_check'
  ) THEN
    ALTER TABLE public.matches
      DROP CONSTRAINT matches_phase_check;
  END IF;

  ALTER TABLE public.matches
    ADD CONSTRAINT matches_phase_check
    CHECK (phase IS NULL OR phase IN ('group', 'knockout', 'league'));

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_result_check'
  ) THEN
    ALTER TABLE public.matches
      DROP CONSTRAINT matches_result_check;
  END IF;

  ALTER TABLE public.matches
    ADD CONSTRAINT matches_result_check
    CHECK (result IN ('pending', 'winner', 'eliminated', 'advanced', 'draw'));
END $$;
