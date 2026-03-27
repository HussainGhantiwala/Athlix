-- Remove provisional/finalized completion flow and enforce a single completed state.
-- This migration is written to be safe against partially migrated environments.

-- 1) Backfill legacy statuses and normalize completion fields.
UPDATE public.matches
SET status = 'completed'
WHERE status::text IN ('completed_provisional', 'finalized');

UPDATE public.matches
SET
  phase = 'finished',
  result_status = 'final',
  completed_at = COALESCE(completed_at, now()),
  winner_id = COALESCE(winner_id, winner_team_id),
  winner_team_id = COALESCE(winner_team_id, winner_id)
WHERE status::text = 'completed';

UPDATE public.matches
SET result_status = 'pending'
WHERE status::text <> 'completed'
  AND COALESCE(result_status, 'pending') <> 'pending';

-- 2) Replace old result_status checks with a simplified pending/final model.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.matches'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%result_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END
$$;

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_result_status_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_result_status_check
  CHECK (result_status IN ('pending', 'final'));

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_completed_state_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_completed_state_check
  CHECK (
    status::text <> 'completed'
    OR (
      phase = 'finished'
      AND result_status = 'final'
    )
  );

-- 3) Normalize future writes automatically.
CREATE OR REPLACE FUNCTION public.normalize_match_completion_states()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status::text IN ('completed_provisional', 'finalized') THEN
    NEW.status := 'completed';
  END IF;

  IF NEW.status::text = 'completed' THEN
    NEW.phase := 'finished';
    NEW.result_status := 'final';
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.winner_id := COALESCE(NEW.winner_id, NEW.winner_team_id);
    NEW.winner_team_id := COALESCE(NEW.winner_team_id, NEW.winner_id);
  ELSE
    NEW.result_status := COALESCE(NEW.result_status, 'pending');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_match_completion_states ON public.matches;

CREATE TRIGGER trg_normalize_match_completion_states
BEFORE INSERT OR UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.normalize_match_completion_states();
