-- Backfill legacy provisional status to the new completed status.
-- This must run in a separate migration transaction from enum value creation.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'match_status'
      AND e.enumlabel = 'completed'
  ) THEN
    UPDATE public.matches
    SET status = 'completed'
    WHERE status = 'completed_provisional';
  END IF;
END $$;

