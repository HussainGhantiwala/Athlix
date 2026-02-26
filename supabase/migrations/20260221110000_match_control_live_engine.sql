-- ================================================================
-- MATCH CONTROL + LIVE SCORE ENGINE
-- ================================================================

-- 1) Extend match lifecycle enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'match_status'
      AND e.enumlabel = 'paused'
  ) THEN
    ALTER TYPE public.match_status ADD VALUE 'paused' AFTER 'live';
  END IF;
END $$;

-- 2) Add required match fields
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS score_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS winner_id UUID REFERENCES public.teams(id),
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bracket_position INTEGER;

-- Convert legacy text round -> integer round if needed.
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.matches
      ALTER COLUMN round TYPE INTEGER
      USING NULLIF(regexp_replace(round::text, '[^0-9]', '', 'g'), '')::INTEGER;
  EXCEPTION
    WHEN undefined_column THEN
      NULL;
  END;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matches_round_positive'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_round_positive CHECK (round IS NULL OR round > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matches_bracket_position_positive'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_bracket_position_positive CHECK (
        bracket_position IS NULL OR bracket_position > 0
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_matches_event_sport_round_position
  ON public.matches(event_sport_id, round, bracket_position);

CREATE INDEX IF NOT EXISTS idx_matches_status_round
  ON public.matches(status, round);

-- Keep legacy timestamp columns aligned for existing screens.
UPDATE public.matches
SET
  start_time = COALESCE(start_time, started_at),
  end_time = COALESCE(end_time, completed_at),
  started_at = COALESCE(started_at, start_time),
  completed_at = COALESCE(completed_at, end_time);

CREATE OR REPLACE FUNCTION public.sync_match_time_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.start_time := COALESCE(NEW.start_time, NEW.started_at);
  NEW.end_time := COALESCE(NEW.end_time, NEW.completed_at);
  NEW.started_at := COALESCE(NEW.started_at, NEW.start_time);
  NEW.completed_at := COALESCE(NEW.completed_at, NEW.end_time);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_match_time_columns ON public.matches;
CREATE TRIGGER trg_sync_match_time_columns
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_match_time_columns();

-- 3) Assignment helpers + strict transition permissions
CREATE OR REPLACE FUNCTION public.is_match_assigned(
  _user_id UUID,
  _match_id UUID,
  _role app_role DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    JOIN public.event_sports es ON es.id = m.event_sport_id
    JOIN public.coordinator_assignments ca ON ca.event_id = es.event_id
    WHERE m.id = _match_id
      AND ca.user_id = _user_id
      AND (_role IS NULL OR ca.role = _role)
  )
$$;

CREATE OR REPLACE FUNCTION public.enforce_match_lifecycle_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _is_admin BOOLEAN := public.has_role(_uid, 'admin');
  _is_faculty BOOLEAN := public.has_role(_uid, 'faculty');
  _is_coordinator BOOLEAN := public.has_role(_uid, 'student_coordinator');
  _assigned_as_coord BOOLEAN := public.is_match_assigned(_uid, OLD.id, 'student_coordinator');
  _assigned_as_faculty BOOLEAN := public.is_match_assigned(_uid, OLD.id, 'faculty');
  _top_team UUID;
  _top_score INTEGER;
  _second_score INTEGER;
BEGIN
  IF current_setting('athletix.match_bypass', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated users cannot update matches';
  END IF;

  -- Admin is read-only for normal mutation path.
  IF _is_admin THEN
    RAISE EXCEPTION 'Admin updates must use admin_override_match()';
  END IF;

  -- Student Coordinator controls: start/live score/end provisional.
  IF _is_coordinator THEN
    IF NOT _assigned_as_coord THEN
      RAISE EXCEPTION 'Coordinator is not assigned to this match';
    END IF;

    IF NEW.status <> OLD.status THEN
      IF OLD.status = 'scheduled' AND NEW.status = 'live' THEN
        NEW.start_time := COALESCE(NEW.start_time, now());
      ELSIF OLD.status = 'live' AND NEW.status = 'paused' THEN
        NULL;
      ELSIF OLD.status = 'paused' AND NEW.status = 'live' THEN
        NULL;
      ELSIF OLD.status IN ('live', 'paused') AND NEW.status = 'completed_provisional' THEN
        NEW.end_time := COALESCE(NEW.end_time, now());
      ELSE
        RAISE EXCEPTION 'Invalid coordinator transition: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;

    IF NEW.status = 'finalized' THEN
      RAISE EXCEPTION 'Coordinators cannot finalize matches';
    END IF;

    IF NEW.score_data IS DISTINCT FROM OLD.score_data AND OLD.status <> 'live' THEN
      RAISE EXCEPTION 'Live score can only be edited while match is live';
    END IF;

    RETURN NEW;
  END IF;

  -- Faculty controls: finalize or reopen completed_provisional.
  IF _is_faculty THEN
    IF NOT (_assigned_as_faculty OR _assigned_as_coord) THEN
      RAISE EXCEPTION 'Faculty is not assigned to this match';
    END IF;

    IF NEW.score_data IS DISTINCT FROM OLD.score_data THEN
      RAISE EXCEPTION 'Faculty cannot edit live score payload';
    END IF;

    IF NEW.status <> OLD.status THEN
      IF OLD.status = 'completed_provisional' AND NEW.status = 'finalized' THEN
        IF NEW.winner_id IS NULL THEN
          SELECT
            (array_agg(s.team_id ORDER BY s.score_value DESC))[1],
            (array_agg(s.score_value ORDER BY s.score_value DESC))[1],
            (array_agg(s.score_value ORDER BY s.score_value DESC))[2]
          INTO _top_team, _top_score, _second_score
          FROM public.scores s
          WHERE s.match_id = OLD.id;

          IF _top_score IS NOT NULL AND (_second_score IS NULL OR _top_score > _second_score) THEN
            NEW.winner_id := _top_team;
          END IF;
        END IF;

        NEW.finalized_by := COALESCE(NEW.finalized_by, _uid);
        NEW.finalized_at := COALESCE(NEW.finalized_at, now());
      ELSIF OLD.status = 'completed_provisional' AND NEW.status = 'live' THEN
        NEW.finalized_by := NULL;
        NEW.finalized_at := NULL;
      ELSE
        RAISE EXCEPTION 'Invalid faculty transition: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Role is not authorized to mutate matches';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_match_lifecycle_permissions ON public.matches;
CREATE TRIGGER trg_enforce_match_lifecycle_permissions
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_match_lifecycle_permissions();

-- 4) Knockout auto-advancement on finalization
CREATE OR REPLACE FUNCTION public.advance_knockout_winner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _format TEXT;
  _next_round INTEGER;
  _next_position INTEGER;
BEGIN
  IF NEW.status = 'finalized'
     AND OLD.status IS DISTINCT FROM 'finalized'
     AND NEW.winner_id IS NOT NULL
     AND NEW.round IS NOT NULL
     AND NEW.bracket_position IS NOT NULL THEN
    SELECT es.match_format
    INTO _format
    FROM public.event_sports es
    WHERE es.id = NEW.event_sport_id;

    IF _format ILIKE '%knockout%' THEN
      _next_round := NEW.round + 1;
      _next_position := ((NEW.bracket_position + 1) / 2)::INTEGER;

      PERFORM set_config('athletix.match_bypass', '1', true);

      IF (NEW.bracket_position % 2) = 1 THEN
        UPDATE public.matches
        SET team_a_id = NEW.winner_id
        WHERE event_sport_id = NEW.event_sport_id
          AND round = _next_round
          AND bracket_position = _next_position;
      ELSE
        UPDATE public.matches
        SET team_b_id = NEW.winner_id
        WHERE event_sport_id = NEW.event_sport_id
          AND round = _next_round
          AND bracket_position = _next_position;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_knockout_winner ON public.matches;
CREATE TRIGGER trg_advance_knockout_winner
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.advance_knockout_winner();

-- 5) Admin override RPC (explicit elevated path)
CREATE OR REPLACE FUNCTION public.admin_override_match(
  p_match_id UUID,
  p_status public.match_status DEFAULT NULL,
  p_score_data JSONB DEFAULT NULL,
  p_winner_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _match public.matches;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can call admin_override_match';
  END IF;

  PERFORM set_config('athletix.match_bypass', '1', true);

  UPDATE public.matches
  SET
    status = COALESCE(p_status, status),
    score_data = COALESCE(p_score_data, score_data),
    winner_id = COALESCE(p_winner_id, winner_id),
    finalized_by = CASE
      WHEN p_status = 'finalized' THEN COALESCE(finalized_by, auth.uid())
      ELSE finalized_by
    END,
    finalized_at = CASE
      WHEN p_status = 'finalized' THEN COALESCE(finalized_at, now())
      ELSE finalized_at
    END
  WHERE id = p_match_id
  RETURNING * INTO _match;

  IF _match.id IS NULL THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  INSERT INTO public.audit_logs(table_name, record_id, action, reason, performed_by, new_data)
  VALUES (
    'matches',
    _match.id,
    'admin_override',
    p_reason,
    auth.uid(),
    jsonb_build_object(
      'status', _match.status,
      'winner_id', _match.winner_id
    )
  );

  RETURN _match;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_override_match(UUID, public.match_status, JSONB, UUID, TEXT)
TO authenticated;

-- 6) Replace match/scores policies with strict role boundaries
DROP POLICY IF EXISTS "Anyone can view matches" ON public.matches;
DROP POLICY IF EXISTS "Faculty can manage matches" ON public.matches;
DROP POLICY IF EXISTS "Student coordinators can update live matches" ON public.matches;

CREATE POLICY "Public can read matches"
  ON public.matches FOR SELECT
  USING (true);

CREATE POLICY "Faculty or admin can create matches"
  ON public.matches FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Assigned coordinators can update matches"
  ON public.matches FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'student_coordinator')
    AND public.is_match_assigned(auth.uid(), id, 'student_coordinator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'student_coordinator')
    AND public.is_match_assigned(auth.uid(), id, 'student_coordinator')
  );

CREATE POLICY "Assigned faculty can finalize or reopen matches"
  ON public.matches FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'faculty')
    AND (
      public.is_match_assigned(auth.uid(), id, 'faculty')
      OR public.is_match_assigned(auth.uid(), id, 'student_coordinator')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'faculty')
    AND (
      public.is_match_assigned(auth.uid(), id, 'faculty')
      OR public.is_match_assigned(auth.uid(), id, 'student_coordinator')
    )
  );

DROP POLICY IF EXISTS "Anyone can view scores" ON public.scores;
DROP POLICY IF EXISTS "Student coordinators can update provisional scores" ON public.scores;
DROP POLICY IF EXISTS "Coordinators can insert scores" ON public.scores;

CREATE POLICY "Public can read scores"
  ON public.scores FOR SELECT
  USING (true);

CREATE POLICY "Assigned coordinators can insert live scores"
  ON public.scores FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'student_coordinator')
    AND EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = scores.match_id
        AND m.status = 'live'
        AND public.is_match_assigned(auth.uid(), m.id, 'student_coordinator')
    )
  );

CREATE POLICY "Assigned coordinators can update live scores"
  ON public.scores FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'student_coordinator')
    AND EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = scores.match_id
        AND m.status = 'live'
        AND public.is_match_assigned(auth.uid(), m.id, 'student_coordinator')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'student_coordinator')
    AND EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.id = scores.match_id
        AND m.status = 'live'
        AND public.is_match_assigned(auth.uid(), m.id, 'student_coordinator')
    )
  );
