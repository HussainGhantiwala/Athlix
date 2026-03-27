CREATE TABLE IF NOT EXISTS public.team_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_sport_id UUID NOT NULL REFERENCES public.event_sports(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  jersey_number INTEGER,
  is_dummy BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_players ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_team_players_event_id ON public.team_players(event_id);
CREATE INDEX IF NOT EXISTS idx_team_players_event_sport_id ON public.team_players(event_sport_id);
CREATE INDEX IF NOT EXISTS idx_team_players_team_id ON public.team_players(team_id);

DROP POLICY IF EXISTS "Anyone can view team players" ON public.team_players;
CREATE POLICY "Anyone can view team players"
  ON public.team_players FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Coordinators can manage team players" ON public.team_players;
CREATE POLICY "Coordinators can manage team players"
  ON public.team_players FOR ALL TO authenticated
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

CREATE OR REPLACE FUNCTION public.generate_test_teams_for_event(
  _event_id UUID,
  _event_sport_id UUID,
  _team_size INTEGER DEFAULT NULL,
  _max_teams INTEGER DEFAULT 8,
  _replace_existing BOOLEAN DEFAULT true,
  _created_by UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event RECORD;
  _event_sport RECORD;
  _resolved_team_size INTEGER;
  _safe_max_teams INTEGER := LEAST(GREATEST(COALESCE(_max_teams, 8), 2), 8);
  _existing_team_count INTEGER := 0;
  _total_players INTEGER;
  _total_teams INTEGER;
  _base_players_per_team INTEGER;
  _extra_players INTEGER;
  _team_idx INTEGER;
  _player_idx INTEGER := 1;
  _players_in_team INTEGER;
  _team_name TEXT;
  _team_id UUID;
  _shuffled_players TEXT[];
  _match_ids UUID[];
BEGIN
  SELECT id, name, university_id, status
  INTO _event
  FROM public.events
  WHERE id = _event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  SELECT
    es.id,
    es.event_id,
    es.sport_category_id,
    sc.name AS sport_name,
    sc.min_team_size,
    sc.max_team_size
  INTO _event_sport
  FROM public.event_sports es
  JOIN public.sports_categories sc ON sc.id = es.sport_category_id
  WHERE es.id = _event_sport_id
    AND es.event_id = _event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event sport not found for this event';
  END IF;

  _resolved_team_size := COALESCE(
    NULLIF(_team_size, 0),
    NULLIF(_event_sport.min_team_size, 0),
    CASE
      WHEN lower(COALESCE(_event_sport.sport_name, '')) IN ('football', 'cricket', 'hockey') THEN 11
      ELSE 5
    END
  );

  IF _resolved_team_size < 1 THEN
    RAISE EXCEPTION 'Team size must be at least 1';
  END IF;

  IF _event_sport.max_team_size IS NOT NULL AND _resolved_team_size > _event_sport.max_team_size THEN
    RAISE EXCEPTION 'Team size cannot exceed the sport maximum of %', _event_sport.max_team_size;
  END IF;

  SELECT count(*)
  INTO _existing_team_count
  FROM public.teams
  WHERE event_sport_id = _event_sport_id;

  IF _existing_team_count > 0 AND NOT COALESCE(_replace_existing, false) THEN
    RAISE EXCEPTION 'Teams already exist for this event sport';
  END IF;

  IF _existing_team_count > 0 THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
    INTO _match_ids
    FROM public.matches
    WHERE event_sport_id = _event_sport_id;

    IF COALESCE(array_length(_match_ids, 1), 0) > 0 THEN
      DELETE FROM public.score_history
      WHERE match_id = ANY(_match_ids);

      DELETE FROM public.scores
      WHERE match_id = ANY(_match_ids);
    END IF;

    DELETE FROM public.matches
    WHERE event_sport_id = _event_sport_id;

    DELETE FROM public.team_standings
    WHERE event_sport_id = _event_sport_id;

    DELETE FROM public.teams
    WHERE event_sport_id = _event_sport_id;
  END IF;

  _total_players := GREATEST(
    _resolved_team_size * 2,
    FLOOR(random() * (40 - 20 + 1) + 20)::INTEGER
  );

  _total_teams := LEAST(
    _safe_max_teams,
    GREATEST(2, FLOOR(_total_players::NUMERIC / _resolved_team_size)::INTEGER)
  );

  _base_players_per_team := FLOOR(_total_players::NUMERIC / _total_teams)::INTEGER;
  _extra_players := MOD(_total_players, _total_teams);

  SELECT array_agg(player_name ORDER BY random())
  INTO _shuffled_players
  FROM (
    SELECT format('Player %s', player_number) AS player_name
    FROM generate_series(1, _total_players) AS player_number
  ) generated_players;

  FOR _team_idx IN 1.._total_teams LOOP
    _team_name := format('Team %s', chr(64 + _team_idx));

    INSERT INTO public.teams (
      name,
      event_sport_id,
      event_id,
      sport_id,
      university_id,
      status,
      approved_by,
      approved_at,
      created_by
    )
    VALUES (
      _team_name,
      _event_sport_id,
      _event_id,
      _event_sport.sport_category_id,
      _event.university_id,
      'approved',
      _created_by,
      now(),
      _created_by
    )
    RETURNING id INTO _team_id;

    _players_in_team := _base_players_per_team + CASE WHEN _team_idx <= _extra_players THEN 1 ELSE 0 END;

    FOR _player_offset IN 1.._players_in_team LOOP
      INSERT INTO public.team_players (
        event_id,
        event_sport_id,
        team_id,
        name,
        jersey_number,
        is_dummy,
        created_by
      )
      VALUES (
        _event_id,
        _event_sport_id,
        _team_id,
        _shuffled_players[_player_idx],
        _player_offset,
        true,
        _created_by
      );

      _player_idx := _player_idx + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'eventId', _event_id,
    'eventSportId', _event_sport_id,
    'sportName', _event_sport.sport_name,
    'teamSize', _resolved_team_size,
    'teamCount', _total_teams,
    'playerCount', _total_players,
    'maxTeams', _safe_max_teams,
    'replacedExisting', _existing_team_count > 0,
    'message', 'Teams generated successfully (max 8 teams)'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_test_teams_for_event(UUID, UUID, INTEGER, INTEGER, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_test_teams_for_event(UUID, UUID, INTEGER, INTEGER, BOOLEAN, UUID) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'team_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_players;
  END IF;
END $$;
