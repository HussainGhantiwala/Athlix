-- Full knockout linking support:
-- - next_match_id allows deterministic winner propagation.
-- - winner_name stores direct winner for participant-name brackets.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS next_match_id UUID,
  ADD COLUMN IF NOT EXISTS winner_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_next_match_id_fkey'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_next_match_id_fkey
      FOREIGN KEY (next_match_id)
      REFERENCES public.matches(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_matches_event_round_match_no
  ON public.matches(event_id, round, match_number);

CREATE INDEX IF NOT EXISTS idx_matches_next_match_id
  ON public.matches(next_match_id);
