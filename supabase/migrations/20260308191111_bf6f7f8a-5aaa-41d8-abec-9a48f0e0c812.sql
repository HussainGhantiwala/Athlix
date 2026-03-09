ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS penalty_a integer DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS penalty_b integer DEFAULT 0;