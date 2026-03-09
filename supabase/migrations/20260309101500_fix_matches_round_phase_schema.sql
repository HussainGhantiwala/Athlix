-- Align matches schema with stage-in-round and state-in-phase model.
-- round: tournament stage tokens
-- phase: live match state tokens

-- 1) Ensure round is TEXT (some older migrations forced INTEGER)
DO $$
DECLARE
  round_data_type TEXT;
BEGIN
  SELECT c.data_type
  INTO round_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'matches'
    AND c.column_name = 'round';

  IF round_data_type = 'integer' OR round_data_type = 'smallint' OR round_data_type = 'bigint' THEN
    ALTER TABLE public.matches
      ALTER COLUMN round DROP DEFAULT;

    ALTER TABLE public.matches
      ALTER COLUMN round TYPE TEXT
      USING round::TEXT;
  END IF;
END $$;

-- 2) Normalize existing round values to supported stage tokens
UPDATE public.matches
SET round = CASE
  WHEN round IS NULL THEN NULL
  WHEN lower(trim(round)) IN ('group', 'group_stage', 'league') THEN 'group_stage'
  WHEN lower(trim(round)) IN ('round_of_16', 'round of 16', 'roundof16', 'ro16', 'r16', '1/8') THEN 'round_of_16'
  WHEN lower(trim(round)) IN ('quarterfinal', 'quarter_final', 'quarter-final', 'qf') THEN 'quarterfinal'
  WHEN lower(trim(round)) IN ('semi', 'semi_final', 'semi-final', 'semifinal', 'sf') THEN 'semifinal'
  WHEN lower(trim(round)) IN ('final', 'f') THEN 'final'
  WHEN trim(round) = '1' THEN 'group_stage'
  WHEN trim(round) = '2' THEN 'quarterfinal'
  WHEN trim(round) = '3' THEN 'semifinal'
  WHEN trim(round) = '4' THEN 'final'
  ELSE 'group_stage'
END;

-- 3) Enforce valid round values
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_round_positive;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_round_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_round_check
  CHECK (
    round IS NULL OR round IN ('group_stage', 'round_of_16', 'quarterfinal', 'semifinal', 'final')
  );

-- 4) Normalize existing phase values to match-state tokens
UPDATE public.matches
SET phase = CASE
  WHEN phase IS NULL THEN 'not_started'
  WHEN lower(trim(phase)) IN ('not_started', 'first_half', 'halftime', 'second_half', 'penalties', 'finished') THEN lower(trim(phase))
  WHEN lower(trim(phase)) IN ('group', 'knockout', 'league', 'scheduled', 'pending') THEN 'not_started'
  WHEN lower(trim(phase)) IN ('complete', 'completed', 'finalized', 'ended', 'done') THEN 'finished'
  ELSE 'not_started'
END;

-- 5) Enforce valid phase values
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_phase_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_phase_check
  CHECK (
    phase IS NULL OR phase IN ('not_started', 'first_half', 'halftime', 'second_half', 'penalties', 'finished')
  );

ALTER TABLE public.matches
  ALTER COLUMN phase SET DEFAULT 'not_started';

-- 6) Ensure round_number exists for numeric sequencing
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS round_number INTEGER;

-- 7) Ensure next_match_id exists for knockout progression
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS next_match_id UUID;

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

CREATE INDEX IF NOT EXISTS idx_matches_next_match_id ON public.matches(next_match_id);

-- 8) Add integer group_id only when public.groups(id) is integer
DO $$
DECLARE
  groups_id_type TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'groups'
  ) THEN
    SELECT c.data_type
    INTO groups_id_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'groups'
      AND c.column_name = 'id';

    IF groups_id_type = 'integer' THEN
      ALTER TABLE public.matches
        ADD COLUMN IF NOT EXISTS group_id INTEGER;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'matches_group_id_fkey'
      ) THEN
        ALTER TABLE public.matches
          ADD CONSTRAINT matches_group_id_fkey
          FOREIGN KEY (group_id)
          REFERENCES public.groups(id)
          ON DELETE SET NULL;
      END IF;

      CREATE INDEX IF NOT EXISTS idx_matches_group_id ON public.matches(group_id);
    END IF;
  END IF;
END $$;
