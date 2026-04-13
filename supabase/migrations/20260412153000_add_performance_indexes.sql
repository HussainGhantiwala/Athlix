CREATE INDEX IF NOT EXISTS events_university_id_idx
  ON public.events (university_id);

CREATE INDEX IF NOT EXISTS teams_university_id_idx
  ON public.teams (university_id);

CREATE INDEX IF NOT EXISTS registrations_university_id_idx
  ON public.registrations (university_id);

CREATE INDEX IF NOT EXISTS profiles_email_lower_idx
  ON public.profiles (lower(email));

CREATE INDEX IF NOT EXISTS user_roles_role_idx
  ON public.user_roles (role);

CREATE INDEX IF NOT EXISTS user_roles_university_role_idx
  ON public.user_roles (university_id, role);
