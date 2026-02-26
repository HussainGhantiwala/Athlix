-- ================================================================
-- TOURNAMENT ENGINE (AUTO FORMAT + GROUP STANDINGS + KNOCKOUT FLOW)
-- ================================================================

-- 1) Extend matches for tournament phases
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS round_number INTEGER,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS winner_id UUID REFERENCES public.teams(id);

-- Keep round as textual label for knockout rounds.
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_round_positive;

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.matches
      ALTER COLUMN round TYPE TEXT USING round::TEXT;
  EXCEPTION
    WHEN undefined_column THEN
      NULL;
  END;
END $$;

UPDATE public.matches
SET phase = COALESCE(phase, 'knockout');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matches_phase_check'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_phase_check CHECK (phase IN ('group', 'knockout'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matches_round_number_positive'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_round_number_positive CHECK (round_number IS NULL OR round_number > 0);
  END IF;
END $$;

ALTER TABLE public.matches
  ALTER COLUMN phase SET DEFAULT 'knockout';

CREATE INDEX IF NOT EXISTS idx_matches_phase_status ON public.matches(phase, status);
CREATE INDEX IF NOT EXISTS idx_matches_event_phase_group ON public.matches(event_sport_id, phase, group_name);

-- 2) Group standings table
CREATE TABLE IF NOT EXISTS public.group_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  draw INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  goal_difference INTEGER NOT NULL DEFAULT 0,
  net_run_rate NUMERIC(10,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, group_name, team_id)
);

ALTER TABLE public.group_standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read group standings" ON public.group_standings;
DROP POLICY IF EXISTS "Coordinators and faculty can manage group standings" ON public.group_standings;

CREATE POLICY "Authenticated can read group standings"
  ON public.group_standings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Coordinators and faculty can manage group standings"
  ON public.group_standings FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student_coordinator')
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student_coordinator')
    OR public.has_role(auth.uid(), 'admin')
  );

DROP TRIGGER IF EXISTS update_group_standings_updated_at ON public.group_standings;
CREATE TRIGGER update_group_standings_updated_at
  BEFORE UPDATE ON public.group_standings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 3) Helper to check assignment using event_sport id
CREATE OR REPLACE FUNCTION public.is_event_sport_assigned(_user_id UUID, _event_sport_id UUID, _role app_role DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_sports es
    JOIN public.coordinator_assignments ca ON ca.event_id = es.event_id
    WHERE es.id = _event_sport_id
      AND ca.user_id = _user_id
      AND (_role IS NULL OR ca.role = _role)
  )
$$;

-- 4) Tighten match policies for tournament generation flow
DROP POLICY IF EXISTS "Faculty or admin can create matches" ON public.matches;
DROP POLICY IF EXISTS "Assigned coordinators can create scheduled matches" ON public.matches;

CREATE POLICY "Assigned coordinators can create scheduled matches"
  ON public.matches FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'student_coordinator')
    AND public.is_event_sport_assigned(auth.uid(), event_sport_id, 'student_coordinator')
    AND status = 'scheduled'
  );

CREATE POLICY "Faculty can create scheduled matches"
  ON public.matches FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'faculty')
    AND status = 'scheduled'
  );

-- 5) Auto-update group standings on finalized group match
CREATE OR REPLACE FUNCTION public.update_group_standings_from_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_id UUID;
  _group_name TEXT;
  _score_a INTEGER := 0;
  _score_b INTEGER := 0;
  _winner UUID;
BEGIN
  IF NOT (NEW.status = 'finalized' AND OLD.status IS DISTINCT FROM 'finalized') THEN
    RETURN NEW;
  END IF;

  IF NEW.phase IS DISTINCT FROM 'group' THEN
    RETURN NEW;
  END IF;

  IF NEW.team_a_id IS NULL OR NEW.team_b_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT es.event_id INTO _event_id
  FROM public.event_sports es
  WHERE es.id = NEW.event_sport_id;

  IF _event_id IS NULL THEN
    RETURN NEW;
  END IF;

  _group_name := COALESCE(NEW.group_name, 'ALL');

  INSERT INTO public.group_standings(event_id, group_name, team_id)
  VALUES (_event_id, _group_name, NEW.team_a_id)
  ON CONFLICT (event_id, group_name, team_id) DO NOTHING;

  INSERT INTO public.group_standings(event_id, group_name, team_id)
  VALUES (_event_id, _group_name, NEW.team_b_id)
  ON CONFLICT (event_id, group_name, team_id) DO NOTHING;

  SELECT COALESCE(MAX(s.score_value), 0)
  INTO _score_a
  FROM public.scores s
  WHERE s.match_id = NEW.id AND s.team_id = NEW.team_a_id;

  SELECT COALESCE(MAX(s.score_value), 0)
  INTO _score_b
  FROM public.scores s
  WHERE s.match_id = NEW.id AND s.team_id = NEW.team_b_id;

  _winner := NEW.winner_id;
  IF _winner IS NULL THEN
    IF _score_a > _score_b THEN
      _winner := NEW.team_a_id;
    ELSIF _score_b > _score_a THEN
      _winner := NEW.team_b_id;
    END IF;
  END IF;

  UPDATE public.group_standings
  SET
    played = played + 1,
    won = won + CASE WHEN _winner = NEW.team_a_id THEN 1 ELSE 0 END,
    lost = lost + CASE WHEN _winner = NEW.team_b_id THEN 1 ELSE 0 END,
    draw = draw + CASE WHEN _winner IS NULL THEN 1 ELSE 0 END,
    points = points + CASE
      WHEN _winner = NEW.team_a_id THEN 3
      WHEN _winner IS NULL THEN 1
      ELSE 0
    END,
    goal_difference = goal_difference + (_score_a - _score_b)
  WHERE event_id = _event_id AND group_name = _group_name AND team_id = NEW.team_a_id;

  UPDATE public.group_standings
  SET
    played = played + 1,
    won = won + CASE WHEN _winner = NEW.team_b_id THEN 1 ELSE 0 END,
    lost = lost + CASE WHEN _winner = NEW.team_a_id THEN 1 ELSE 0 END,
    draw = draw + CASE WHEN _winner IS NULL THEN 1 ELSE 0 END,
    points = points + CASE
      WHEN _winner = NEW.team_b_id THEN 3
      WHEN _winner IS NULL THEN 1
      ELSE 0
    END,
    goal_difference = goal_difference + (_score_b - _score_a)
  WHERE event_id = _event_id AND group_name = _group_name AND team_id = NEW.team_b_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_group_standings_from_match ON public.matches;
CREATE TRIGGER trg_update_group_standings_from_match
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_group_standings_from_match();

-- 6) Auto-create knockout semis/final once group stage completes
CREATE OR REPLACE FUNCTION public.maybe_create_knockout_from_standings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_id UUID;
  _format TEXT;
  _pending_groups INTEGER;
  _existing_knockout INTEGER;
  _start_at TIMESTAMPTZ;
  _all_ids UUID[];
  _a_ids UUID[];
  _b_ids UUID[];
BEGIN
  IF NOT (NEW.status = 'finalized' AND OLD.status IS DISTINCT FROM 'finalized') THEN
    RETURN NEW;
  END IF;

  IF NEW.phase IS DISTINCT FROM 'group' THEN
    RETURN NEW;
  END IF;

  SELECT es.event_id, es.match_format, (e.start_date::timestamptz)
  INTO _event_id, _format, _start_at
  FROM public.event_sports es
  JOIN public.events e ON e.id = es.event_id
  WHERE es.id = NEW.event_sport_id;

  IF _event_id IS NULL OR _format IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO _pending_groups
  FROM public.matches m
  WHERE m.event_sport_id = NEW.event_sport_id
    AND m.phase = 'group'
    AND m.status <> 'finalized';

  IF _pending_groups > 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO _existing_knockout
  FROM public.matches m
  WHERE m.event_sport_id = NEW.event_sport_id
    AND m.phase = 'knockout'
    AND m.round = 'semi';

  IF _existing_knockout > 0 THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('athletix.match_bypass', '1', true);

  IF _format = 'single_round_robin_then_knockout' THEN
    SELECT ARRAY(
      SELECT gs.team_id
      FROM public.group_standings gs
      WHERE gs.event_id = _event_id AND gs.group_name = 'ALL'
      ORDER BY gs.points DESC, gs.goal_difference DESC, gs.net_run_rate DESC, gs.played DESC
      LIMIT 4
    ) INTO _all_ids;

    IF _all_ids IS NULL OR array_length(_all_ids, 1) < 4 THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.matches(event_sport_id, team_a_id, team_b_id, scheduled_at, status, phase, round, round_number, match_number)
    VALUES
      (NEW.event_sport_id, _all_ids[1], _all_ids[4], _start_at, 'scheduled', 'knockout', 'semi', 1, 1),
      (NEW.event_sport_id, _all_ids[2], _all_ids[3], _start_at, 'scheduled', 'knockout', 'semi', 1, 2),
      (NEW.event_sport_id, NULL, NULL, _start_at, 'scheduled', 'knockout', 'final', 2, 3);
  ELSIF _format = 'two_groups_then_knockout' THEN
    SELECT ARRAY(
      SELECT gs.team_id
      FROM public.group_standings gs
      WHERE gs.event_id = _event_id AND gs.group_name = 'A'
      ORDER BY gs.points DESC, gs.goal_difference DESC, gs.net_run_rate DESC, gs.played DESC
      LIMIT 2
    ) INTO _a_ids;

    SELECT ARRAY(
      SELECT gs.team_id
      FROM public.group_standings gs
      WHERE gs.event_id = _event_id AND gs.group_name = 'B'
      ORDER BY gs.points DESC, gs.goal_difference DESC, gs.net_run_rate DESC, gs.played DESC
      LIMIT 2
    ) INTO _b_ids;

    IF _a_ids IS NULL OR _b_ids IS NULL OR array_length(_a_ids, 1) < 2 OR array_length(_b_ids, 1) < 2 THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.matches(event_sport_id, team_a_id, team_b_id, scheduled_at, status, phase, round, round_number, match_number)
    VALUES
      (NEW.event_sport_id, _a_ids[1], _b_ids[2], _start_at, 'scheduled', 'knockout', 'semi', 1, 1),
      (NEW.event_sport_id, _b_ids[1], _a_ids[2], _start_at, 'scheduled', 'knockout', 'semi', 1, 2),
      (NEW.event_sport_id, NULL, NULL, _start_at, 'scheduled', 'knockout', 'final', 2, 3);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maybe_create_knockout_from_standings ON public.matches;
CREATE TRIGGER trg_maybe_create_knockout_from_standings
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.maybe_create_knockout_from_standings();

-- 7) Replace knockout advancement trigger for semi/final round labels
CREATE OR REPLACE FUNCTION public.advance_knockout_winner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _winner UUID;
  _final_match_id UUID;
  _score_a INTEGER := 0;
  _score_b INTEGER := 0;
BEGIN
  IF NOT (NEW.status = 'finalized' AND OLD.status IS DISTINCT FROM 'finalized') THEN
    RETURN NEW;
  END IF;

  IF NEW.phase IS DISTINCT FROM 'knockout' THEN
    RETURN NEW;
  END IF;

  IF NEW.round IS DISTINCT FROM 'semi' THEN
    RETURN NEW;
  END IF;

  _winner := NEW.winner_id;
  IF _winner IS NULL AND NEW.team_a_id IS NOT NULL AND NEW.team_b_id IS NOT NULL THEN
    SELECT COALESCE(MAX(s.score_value), 0) INTO _score_a
    FROM public.scores s
    WHERE s.match_id = NEW.id AND s.team_id = NEW.team_a_id;

    SELECT COALESCE(MAX(s.score_value), 0) INTO _score_b
    FROM public.scores s
    WHERE s.match_id = NEW.id AND s.team_id = NEW.team_b_id;

    IF _score_a > _score_b THEN
      _winner := NEW.team_a_id;
    ELSIF _score_b > _score_a THEN
      _winner := NEW.team_b_id;
    END IF;
  END IF;

  IF _winner IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.id
  INTO _final_match_id
  FROM public.matches m
  WHERE m.event_sport_id = NEW.event_sport_id
    AND m.phase = 'knockout'
    AND m.round = 'final'
  ORDER BY m.created_at
  LIMIT 1;

  IF _final_match_id IS NULL THEN
    INSERT INTO public.matches(event_sport_id, scheduled_at, status, phase, round, round_number, match_number)
    VALUES (
      NEW.event_sport_id,
      COALESCE(NEW.scheduled_at, now()),
      'scheduled',
      'knockout',
      'final',
      2,
      3
    )
    RETURNING id INTO _final_match_id;
  END IF;

  PERFORM set_config('athletix.match_bypass', '1', true);

  IF COALESCE(NEW.match_number, 0) = 1 THEN
    UPDATE public.matches
    SET team_a_id = _winner
    WHERE id = _final_match_id;
  ELSIF COALESCE(NEW.match_number, 0) = 2 THEN
    UPDATE public.matches
    SET team_b_id = _winner
    WHERE id = _final_match_id;
  ELSE
    UPDATE public.matches
    SET
      team_a_id = CASE WHEN team_a_id IS NULL THEN _winner ELSE team_a_id END,
      team_b_id = CASE WHEN team_a_id IS NOT NULL AND team_b_id IS NULL THEN _winner ELSE team_b_id END
    WHERE id = _final_match_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_knockout_winner ON public.matches;
CREATE TRIGGER trg_advance_knockout_winner
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.advance_knockout_winner();
