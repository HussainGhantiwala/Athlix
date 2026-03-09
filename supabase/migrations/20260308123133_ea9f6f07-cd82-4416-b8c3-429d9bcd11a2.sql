ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS runs_a integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wickets_a integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balls_a integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS runs_b integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wickets_b integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balls_b integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS innings integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS target_score integer;

CREATE OR REPLACE FUNCTION public.apply_cricket_score_action(
  _match_id uuid,
  _action text
)
RETURNS TABLE (
  runs_a integer,
  wickets_a integer,
  balls_a integer,
  runs_b integer,
  wickets_b integer,
  balls_b integer,
  innings integer,
  target_score integer,
  match_phase text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.matches%ROWTYPE;
  u public.matches%ROWTYPE;
  run_inc integer := 0;
  ball_inc integer := 0;
  wicket_inc integer := 0;
  current_innings integer := 1;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_role(auth.uid(), 'student_coordinator'::public.app_role) THEN
    RAISE EXCEPTION 'Only student coordinators can update live cricket scores';
  END IF;

  SELECT *
  INTO m
  FROM public.matches
  WHERE id = _match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF m.status <> 'live'::public.match_status THEN
    RAISE EXCEPTION 'Match is not live';
  END IF;

  current_innings := COALESCE(m.innings, CASE WHEN m.match_phase = 'second_innings' THEN 2 ELSE 1 END, 1);

  CASE lower(_action)
    WHEN 'dot' THEN
      ball_inc := 1;
    WHEN 'run_1' THEN
      run_inc := 1;
      ball_inc := 1;
    WHEN 'run_2' THEN
      run_inc := 2;
      ball_inc := 1;
    WHEN 'run_4' THEN
      run_inc := 4;
      ball_inc := 1;
    WHEN 'run_6' THEN
      run_inc := 6;
      ball_inc := 1;
    WHEN 'wicket' THEN
      wicket_inc := 1;
      ball_inc := 1;
    WHEN 'wide' THEN
      run_inc := 1;
      ball_inc := 0;
    ELSE
      RAISE EXCEPTION 'Invalid cricket action: %', _action;
  END CASE;

  IF current_innings = 1 THEN
    UPDATE public.matches
    SET
      runs_a = COALESCE(runs_a, 0) + run_inc,
      wickets_a = LEAST(10, COALESCE(wickets_a, 0) + wicket_inc),
      balls_a = COALESCE(balls_a, 0) + ball_inc,
      innings = 1,
      updated_at = now()
    WHERE id = _match_id
    RETURNING * INTO u;
  ELSE
    UPDATE public.matches
    SET
      runs_b = COALESCE(runs_b, 0) + run_inc,
      wickets_b = LEAST(10, COALESCE(wickets_b, 0) + wicket_inc),
      balls_b = COALESCE(balls_b, 0) + ball_inc,
      innings = 2,
      updated_at = now()
    WHERE id = _match_id
    RETURNING * INTO u;
  END IF;

  IF u.team_a_id IS NOT NULL AND u.team_b_id IS NOT NULL THEN
    INSERT INTO public.scores (match_id, team_id, score_value, score_details, updated_by)
    VALUES
      (
        u.id,
        u.team_a_id,
        COALESCE(u.runs_a, 0),
        jsonb_build_object(
          'runs', COALESCE(u.runs_a, 0),
          'wickets', COALESCE(u.wickets_a, 0),
          'overs', FLOOR(COALESCE(u.balls_a, 0)::numeric / 6),
          'balls', MOD(COALESCE(u.balls_a, 0), 6),
          'target', u.target_score,
          'innings', 1
        ),
        auth.uid()
      ),
      (
        u.id,
        u.team_b_id,
        COALESCE(u.runs_b, 0),
        jsonb_build_object(
          'runs', COALESCE(u.runs_b, 0),
          'wickets', COALESCE(u.wickets_b, 0),
          'overs', FLOOR(COALESCE(u.balls_b, 0)::numeric / 6),
          'balls', MOD(COALESCE(u.balls_b, 0), 6),
          'target', u.target_score,
          'innings', 2
        ),
        auth.uid()
      )
    ON CONFLICT (match_id, team_id)
    DO UPDATE SET
      score_value = EXCLUDED.score_value,
      score_details = EXCLUDED.score_details,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(u.runs_a, 0),
    COALESCE(u.wickets_a, 0),
    COALESCE(u.balls_a, 0),
    COALESCE(u.runs_b, 0),
    COALESCE(u.wickets_b, 0),
    COALESCE(u.balls_b, 0),
    COALESCE(u.innings, current_innings),
    u.target_score,
    u.match_phase;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_cricket_score_action(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_cricket_score_action(uuid, text) TO authenticated;