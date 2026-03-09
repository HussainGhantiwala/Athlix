-- Matches score columns used as single source of truth by UI.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS score_a INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_b INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing rows in public.scores when available.
UPDATE public.matches m
SET
  score_a = COALESCE(
    (SELECT MAX(s.score_value) FROM public.scores s WHERE s.match_id = m.id AND s.team_id = m.team_a_id),
    m.score_a,
    0
  ),
  score_b = COALESCE(
    (SELECT MAX(s.score_value) FROM public.scores s WHERE s.match_id = m.id AND s.team_id = m.team_b_id),
    m.score_b,
    0
  );

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_score_non_negative;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_score_non_negative
  CHECK (score_a >= 0 AND score_b >= 0);
