
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS toss_winner_id uuid REFERENCES public.teams(id),
  ADD COLUMN IF NOT EXISTS toss_decision text,
  ADD COLUMN IF NOT EXISTS batting_team_id uuid REFERENCES public.teams(id),
  ADD COLUMN IF NOT EXISTS bowling_team_id uuid REFERENCES public.teams(id);
