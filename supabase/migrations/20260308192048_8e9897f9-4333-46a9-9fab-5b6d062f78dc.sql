
-- Indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_matches_event_sport_id ON public.matches(event_sport_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_phase ON public.matches(phase);
CREATE INDEX IF NOT EXISTS idx_matches_round_number ON public.matches(round_number);
CREATE INDEX IF NOT EXISTS idx_teams_event_sport_id ON public.teams(event_sport_id);
CREATE INDEX IF NOT EXISTS idx_teams_status ON public.teams(status);
CREATE INDEX IF NOT EXISTS idx_scores_match_id ON public.scores(match_id);
CREATE INDEX IF NOT EXISTS idx_scores_team_id ON public.scores(team_id);
CREATE INDEX IF NOT EXISTS idx_team_standings_event_sport_id ON public.team_standings(event_sport_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_registration_submissions_form_id ON public.registration_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_registration_forms_event_id ON public.registration_forms(event_id);
CREATE INDEX IF NOT EXISTS idx_registration_forms_status ON public.registration_forms(status);
