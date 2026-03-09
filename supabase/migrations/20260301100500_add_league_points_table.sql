CREATE TABLE IF NOT EXISTS public.league_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  participant_name TEXT NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  draw INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, participant_name)
);

CREATE INDEX IF NOT EXISTS idx_league_points_event_points
  ON public.league_points(event_id, points DESC, won DESC);

ALTER TABLE public.league_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read league points" ON public.league_points;
DROP POLICY IF EXISTS "Privileged can manage league points" ON public.league_points;

CREATE POLICY "Authenticated can read league points"
  ON public.league_points FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Privileged can manage league points"
  ON public.league_points FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student_coordinator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student_coordinator')
  );

DROP TRIGGER IF EXISTS update_league_points_updated_at ON public.league_points;
CREATE TRIGGER update_league_points_updated_at
  BEFORE UPDATE ON public.league_points
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
