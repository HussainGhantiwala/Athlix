
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS match_phase text DEFAULT 'not_started';
