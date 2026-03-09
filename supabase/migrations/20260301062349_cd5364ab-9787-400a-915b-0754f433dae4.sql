
-- 1. Add tournament_type to events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS tournament_type text CHECK (tournament_type IN ('knockout', 'group', 'league'));

-- 2. Add tournament fields to matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS next_match_id uuid REFERENCES public.matches(id);
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS group_name text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS phase text DEFAULT 'knockout';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS result_status text DEFAULT 'pending' CHECK (result_status IN ('pending', 'completed', 'advanced', 'eliminated', 'draw'));
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS winner_team_id uuid REFERENCES public.teams(id);

-- 3. Create team_standings table
CREATE TABLE IF NOT EXISTS public.team_standings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_sport_id uuid NOT NULL REFERENCES public.event_sports(id) ON DELETE CASCADE,
  group_name text,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  team_name text NOT NULL,
  played integer NOT NULL DEFAULT 0,
  won integer NOT NULL DEFAULT 0,
  lost integer NOT NULL DEFAULT 0,
  draw integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  goal_difference integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(event_sport_id, team_id)
);

-- Enable RLS on team_standings
ALTER TABLE public.team_standings ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone can view standings
CREATE POLICY "Anyone can view standings" ON public.team_standings FOR SELECT USING (true);

-- RLS: Admin/Faculty can manage standings
CREATE POLICY "Admin and faculty can manage standings" ON public.team_standings FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'faculty'::app_role)
);

-- RLS: Coordinators can insert/update standings
CREATE POLICY "Coordinators can manage standings" ON public.team_standings FOR ALL USING (
  has_role(auth.uid(), 'student_coordinator'::app_role)
);

-- Enable realtime for team_standings
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_standings;
