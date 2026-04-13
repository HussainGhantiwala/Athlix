ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS domain TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS universities_domain_unique_idx
  ON public.universities (lower(domain))
  WHERE domain IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_university_id_idx
  ON public.profiles (university_id);

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx
  ON public.user_roles (user_id);

CREATE INDEX IF NOT EXISTS user_roles_university_id_idx
  ON public.user_roles (university_id);

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_scoped_unique_idx
  ON public.user_roles (user_id, university_id, role)
  WHERE university_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_global_unique_idx
  ON public.user_roles (user_id, role)
  WHERE university_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'invite_status'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  status public.invite_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invites_email_idx
  ON public.invites (lower(email));

CREATE INDEX IF NOT EXISTS invites_university_id_idx
  ON public.invites (university_id);

CREATE UNIQUE INDEX IF NOT EXISTS invites_pending_email_university_idx
  ON public.invites (lower(email), university_id)
  WHERE status = 'pending';

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.extract_email_domain(_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(lower(split_part(trim(COALESCE(_email, '')), '@', 2)), '')
$$;

CREATE OR REPLACE FUNCTION public.generate_short_name(_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _parts TEXT[];
  _short TEXT := '';
BEGIN
  _parts := regexp_split_to_array(trim(COALESCE(_name, '')), '\s+');

  IF COALESCE(array_length(_parts, 1), 0) = 0 THEN
    RETURN 'UNI';
  END IF;

  IF array_length(_parts, 1) = 1 THEN
    RETURN upper(left(regexp_replace(_parts[1], '[^A-Za-z0-9]', '', 'g'), 10));
  END IF;

  FOR i IN 1..array_length(_parts, 1) LOOP
    IF _parts[i] <> '' THEN
      _short := _short || upper(left(_parts[i], 1));
    END IF;
  END LOOP;

  RETURN left(NULLIF(_short, ''), 10);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_university_id_for_email(_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.universities u
  WHERE lower(u.domain) = public.extract_email_domain(_email)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_university_id(_user_id UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.university_id FROM public.profiles p WHERE p.id = _user_id),
    (
      SELECT ur.university_id
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role <> 'super_admin'
        AND ur.university_id IS NOT NULL
      ORDER BY CASE ur.role
        WHEN 'admin' THEN 1
        WHEN 'faculty' THEN 2
        WHEN 'student_coordinator' THEN 3
        WHEN 'student' THEN 4
        ELSE 5
      END
      LIMIT 1
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_university_role(_user_id UUID, _role public.app_role, _university_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role = 'super_admin'
        OR (
          ur.role = _role
          AND ur.university_id = _university_id
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _role = 'super_admin' THEN public.is_super_admin(_user_id)
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND (
          ur.role = 'super_admin'
          OR (
            ur.role = _role
            AND ur.university_id = public.current_user_university_id(_user_id)
          )
        )
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND (
      ur.role = 'super_admin'
      OR ur.university_id = public.current_user_university_id(_user_id)
    )
  ORDER BY CASE ur.role
    WHEN 'super_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'faculty' THEN 3
    WHEN 'student_coordinator' THEN 4
    WHEN 'student' THEN 5
    ELSE 6
  END
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_access_university(_university_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _university_id IS NOT NULL
    AND (
      public.is_super_admin(auth.uid())
      OR public.current_user_university_id(auth.uid()) = _university_id
    )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_university(_university_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(auth.uid())
    OR public.has_university_role(auth.uid(), 'admin', _university_id)
$$;

CREATE OR REPLACE FUNCTION public.can_access_event(_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = _event_id
      AND public.can_access_university(e.university_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_event_sport(_event_sport_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_sports es
    JOIN public.events e ON e.id = es.event_id
    WHERE es.id = _event_sport_id
      AND public.can_access_university(e.university_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_team(_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    LEFT JOIN public.event_sports es ON es.id = t.event_sport_id
    LEFT JOIN public.events e ON e.id = COALESCE(t.event_id, es.event_id)
    WHERE t.id = _team_id
      AND public.can_access_university(COALESCE(t.university_id, e.university_id))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_match(_match_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    LEFT JOIN public.event_sports es ON es.id = m.event_sport_id
    LEFT JOIN public.events e ON e.id = COALESCE(m.event_id, es.event_id)
    WHERE m.id = _match_id
      AND public.can_access_university(e.university_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_budget(_budget_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.budgets b
    JOIN public.events e ON e.id = b.event_id
    WHERE b.id = _budget_id
      AND public.can_access_university(e.university_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_registration_form(_form_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.registration_forms rf
    JOIN public.events e ON e.id = rf.event_id
    WHERE rf.id = _form_id
      AND public.can_access_university(e.university_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.provision_user_membership(
  _user_id UUID,
  _email TEXT,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _full_name TEXT;
  _registration_mode TEXT;
  _university_name TEXT;
  _requested_domain TEXT;
  _derived_university_id UUID;
BEGIN
  _full_name := COALESCE(
    NULLIF(_metadata->>'full_name', ''),
    split_part(COALESCE(_email, ''), '@', 1)
  );
  _registration_mode := COALESCE(_metadata->>'registration_mode', '');
  _university_name := NULLIF(trim(COALESCE(_metadata->>'university_name', '')), '');
  _requested_domain := NULLIF(lower(trim(COALESCE(_metadata->>'university_domain', ''))), '');

  IF _registration_mode = 'register_university' THEN
    IF _university_name IS NULL OR _requested_domain IS NULL THEN
      RAISE EXCEPTION 'University registration requires name and domain';
    END IF;

    INSERT INTO public.universities (name, short_name, domain, created_by)
    VALUES (_university_name, public.generate_short_name(_university_name), _requested_domain, _user_id)
    RETURNING id INTO _derived_university_id;

    INSERT INTO public.profiles (id, email, full_name, university_id)
    VALUES (_user_id, _email, _full_name, _derived_university_id)
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        university_id = COALESCE(public.profiles.university_id, EXCLUDED.university_id);

    INSERT INTO public.user_roles (user_id, university_id, role)
    VALUES (_user_id, _derived_university_id, 'admin')
    ON CONFLICT DO NOTHING;

    RETURN _derived_university_id;
  END IF;

  _derived_university_id := public.get_university_id_for_email(_email);

  INSERT INTO public.profiles (id, email, full_name, university_id)
  VALUES (_user_id, _email, _full_name, _derived_university_id)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
      university_id = COALESCE(public.profiles.university_id, EXCLUDED.university_id);

  IF _derived_university_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, university_id, role)
    VALUES (_user_id, _derived_university_id, 'student')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN _derived_university_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_membership()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _email TEXT;
  _meta JSONB;
  _university_id UUID;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.email, COALESCE(u.raw_user_meta_data, '{}'::jsonb)
  INTO _email, _meta
  FROM auth.users u
  WHERE u.id = _user_id;

  _university_id := public.provision_user_membership(_user_id, _email, _meta);

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'university_id', _university_id,
    'role', public.get_user_role(_user_id),
    'is_super_admin', public.is_super_admin(_user_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_current_user_university(
  _name TEXT,
  _domain TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _normalized_domain TEXT := NULLIF(lower(trim(COALESCE(_domain, ''))), '');
  _normalized_name TEXT := NULLIF(trim(COALESCE(_name, '')), '');
  _university_id UUID;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _normalized_name IS NULL OR _normalized_domain IS NULL THEN
    RAISE EXCEPTION 'University name and domain are required';
  END IF;

  IF public.current_user_university_id(_user_id) IS NOT NULL AND NOT public.is_super_admin(_user_id) THEN
    RAISE EXCEPTION 'User is already assigned to a university';
  END IF;

  INSERT INTO public.universities (name, short_name, domain, created_by)
  VALUES (_normalized_name, public.generate_short_name(_normalized_name), _normalized_domain, _user_id)
  RETURNING id INTO _university_id;

  UPDATE public.profiles
  SET university_id = _university_id
  WHERE id = _user_id;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role <> 'super_admin';

  INSERT INTO public.user_roles (user_id, university_id, role)
  VALUES (_user_id, _university_id, 'admin')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'university_id', _university_id,
    'role', 'admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invite(_invite_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _email TEXT;
  _invite public.invites%ROWTYPE;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _email
  FROM auth.users
  WHERE id = _user_id;

  SELECT *
  INTO _invite
  FROM public.invites i
  WHERE i.id = _invite_id
    AND lower(i.email) = lower(COALESCE(_email, ''))
    AND i.status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  UPDATE public.profiles
  SET university_id = _invite.university_id
  WHERE id = _user_id;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role <> 'super_admin';

  INSERT INTO public.user_roles (user_id, university_id, role)
  VALUES (_user_id, _invite.university_id, _invite.role)
  ON CONFLICT DO NOTHING;

  UPDATE public.invites
  SET status = 'accepted'
  WHERE id = _invite.id;

  RETURN jsonb_build_object(
    'invite_id', _invite.id,
    'university_id', _invite.university_id,
    'role', _invite.role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.provision_user_membership(NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data, '{}'::jsonb));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_event_university_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.university_id IS NULL THEN
    NEW.university_id := public.current_user_university_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_registration_university_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.university_id IS NULL THEN
    NEW.university_id := public.current_user_university_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_team_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_id UUID;
  _sport_id UUID;
BEGIN
  IF NEW.event_sport_id IS NOT NULL THEN
    SELECT es.event_id, es.sport_category_id
    INTO _event_id, _sport_id
    FROM public.event_sports es
    WHERE es.id = NEW.event_sport_id;

    NEW.event_id := COALESCE(NEW.event_id, _event_id);
    NEW.sport_id := COALESCE(NEW.sport_id, _sport_id);
  END IF;

  IF NEW.university_id IS NULL AND NEW.event_id IS NOT NULL THEN
    SELECT e.university_id
    INTO NEW.university_id
    FROM public.events e
    WHERE e.id = NEW.event_id;
  END IF;

  IF NEW.university_id IS NULL THEN
    NEW.university_id := public.current_user_university_id(auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_venue_university_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.university_id IS NULL THEN
    NEW.university_id := public.current_user_university_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS set_event_university_defaults ON public.events;
CREATE TRIGGER set_event_university_defaults
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_event_university_defaults();

DROP TRIGGER IF EXISTS set_registration_university_defaults ON public.registrations;
CREATE TRIGGER set_registration_university_defaults
  BEFORE INSERT ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_registration_university_defaults();

DROP TRIGGER IF EXISTS set_team_defaults ON public.teams;
CREATE TRIGGER set_team_defaults
  BEFORE INSERT OR UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.set_team_defaults();

DROP TRIGGER IF EXISTS set_venue_university_defaults ON public.venues;
CREATE TRIGGER set_venue_university_defaults
  BEFORE INSERT ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.set_venue_university_defaults();

UPDATE public.profiles p
SET university_id = public.get_university_id_for_email(p.email)
WHERE p.university_id IS NULL
  AND public.get_university_id_for_email(p.email) IS NOT NULL;

UPDATE public.user_roles ur
SET university_id = p.university_id
FROM public.profiles p
WHERE p.id = ur.user_id
  AND ur.role <> 'super_admin'
  AND ur.university_id IS NULL
  AND p.university_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.drop_policies_for_table(_table_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  _policy RECORD;
BEGIN
  FOR _policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = _table_name
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _policy.policyname, _table_name);
  END LOOP;
END;
$$;

SELECT public.drop_policies_for_table('profiles');
SELECT public.drop_policies_for_table('user_roles');
SELECT public.drop_policies_for_table('universities');
SELECT public.drop_policies_for_table('events');
SELECT public.drop_policies_for_table('event_sports');
SELECT public.drop_policies_for_table('coordinator_assignments');
SELECT public.drop_policies_for_table('registrations');
SELECT public.drop_policies_for_table('teams');
SELECT public.drop_policies_for_table('team_members');
SELECT public.drop_policies_for_table('venues');
SELECT public.drop_policies_for_table('matches');
SELECT public.drop_policies_for_table('scores');
SELECT public.drop_policies_for_table('budgets');
SELECT public.drop_policies_for_table('audit_logs');
SELECT public.drop_policies_for_table('score_history');
SELECT public.drop_policies_for_table('match_reopen_requests');
SELECT public.drop_policies_for_table('registration_forms');
SELECT public.drop_policies_for_table('registration_submissions');
SELECT public.drop_policies_for_table('rule_books');
SELECT public.drop_policies_for_table('participants');
SELECT public.drop_policies_for_table('group_standings');
SELECT public.drop_policies_for_table('team_standings');
SELECT public.drop_policies_for_table('league_points');
SELECT public.drop_policies_for_table('team_players');
SELECT public.drop_policies_for_table('invites');

DROP FUNCTION public.drop_policies_for_table(TEXT);

CREATE POLICY "tenant_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.is_super_admin(auth.uid())
    OR (
      public.current_user_university_id(auth.uid()) IS NOT NULL
      AND university_id = public.current_user_university_id(auth.uid())
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_profiles_insert"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "tenant_profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR public.is_super_admin(auth.uid())
    OR public.can_manage_university(university_id)
  )
  WITH CHECK (
    auth.uid() = id
    OR public.is_super_admin(auth.uid())
    OR public.can_manage_university(university_id)
  );

CREATE POLICY "tenant_user_roles_select"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR (university_id IS NOT NULL AND public.can_manage_university(university_id))
  );

CREATE POLICY "tenant_user_roles_insert"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      role <> 'super_admin'
      AND university_id IS NOT NULL
      AND public.can_manage_university(university_id)
    )
  );

CREATE POLICY "tenant_user_roles_update"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      role <> 'super_admin'
      AND university_id IS NOT NULL
      AND public.can_manage_university(university_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      role <> 'super_admin'
      AND university_id IS NOT NULL
      AND public.can_manage_university(university_id)
    )
  );

CREATE POLICY "tenant_user_roles_delete"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      role <> 'super_admin'
      AND university_id IS NOT NULL
      AND public.can_manage_university(university_id)
    )
  );

CREATE POLICY "tenant_universities_select_authenticated"
  ON public.universities FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR id = public.current_user_university_id(auth.uid())
  );

CREATE POLICY "tenant_universities_select_public"
  ON public.universities FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "tenant_universities_manage"
  ON public.universities FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant_invites_select"
  ON public.invites FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.can_manage_university(university_id)
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

CREATE POLICY "tenant_invites_insert"
  ON public.invites FOR INSERT TO authenticated
  WITH CHECK (
    role <> 'super_admin'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_manage_university(university_id)
    )
  );

CREATE POLICY "tenant_invites_update"
  ON public.invites FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.can_manage_university(university_id)
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.can_manage_university(university_id)
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

CREATE POLICY "tenant_invites_delete"
  ON public.invites FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.can_manage_university(university_id)
  );

CREATE POLICY "tenant_events_select_authenticated"
  ON public.events FOR SELECT TO authenticated
  USING (public.can_access_university(university_id));

CREATE POLICY "tenant_events_select_public"
  ON public.events FOR SELECT TO anon
  USING (status IN ('approved', 'active', 'completed'));

CREATE POLICY "tenant_events_insert"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      university_id = public.current_user_university_id(auth.uid())
      AND (
        public.has_university_role(auth.uid(), 'admin', university_id)
        OR public.has_university_role(auth.uid(), 'faculty', university_id)
      )
    )
  );

CREATE POLICY "tenant_events_update"
  ON public.events FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_university(university_id)
      AND (
        public.has_university_role(auth.uid(), 'admin', university_id)
        OR public.has_university_role(auth.uid(), 'faculty', university_id)
        OR public.has_university_role(auth.uid(), 'student_coordinator', university_id)
      )
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      university_id = public.current_user_university_id(auth.uid())
      AND (
        public.has_university_role(auth.uid(), 'admin', university_id)
        OR public.has_university_role(auth.uid(), 'faculty', university_id)
        OR public.has_university_role(auth.uid(), 'student_coordinator', university_id)
      )
    )
  );

CREATE POLICY "tenant_events_delete"
  ON public.events FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_university_role(auth.uid(), 'admin', university_id)
  );

CREATE POLICY "tenant_sports_categories_select"
  ON public.sports_categories FOR SELECT USING (true);

CREATE POLICY "tenant_sports_categories_manage"
  ON public.sports_categories FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant_event_sports_select_authenticated"
  ON public.event_sports FOR SELECT TO authenticated
  USING (public.can_access_event(event_id));

CREATE POLICY "tenant_event_sports_select_public"
  ON public.event_sports FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.status IN ('approved', 'active', 'completed')
    )
  );

CREATE POLICY "tenant_event_sports_manage"
  ON public.event_sports FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.university_id = public.current_user_university_id(auth.uid())
        AND (
          public.has_university_role(auth.uid(), 'admin', e.university_id)
          OR public.has_university_role(auth.uid(), 'faculty', e.university_id)
          OR public.has_university_role(auth.uid(), 'student_coordinator', e.university_id)
        )
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.university_id = public.current_user_university_id(auth.uid())
        AND (
          public.has_university_role(auth.uid(), 'admin', e.university_id)
          OR public.has_university_role(auth.uid(), 'faculty', e.university_id)
          OR public.has_university_role(auth.uid(), 'student_coordinator', e.university_id)
        )
    )
  );

CREATE POLICY "tenant_coordinator_assignments_select"
  ON public.coordinator_assignments FOR SELECT TO authenticated
  USING (public.can_access_event(event_id));

CREATE POLICY "tenant_coordinator_assignments_manage"
  ON public.coordinator_assignments FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND public.has_university_role(auth.uid(), 'admin', e.university_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND public.has_university_role(auth.uid(), 'admin', e.university_id)
    )
  );

CREATE POLICY "tenant_registrations_select"
  ON public.registrations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR (
      university_id = public.current_user_university_id(auth.uid())
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_registrations_insert"
  ON public.registrations FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND university_id = public.current_user_university_id(auth.uid())
    AND public.can_access_event_sport(event_sport_id)
  );

CREATE POLICY "tenant_registrations_update"
  ON public.registrations FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      university_id = public.current_user_university_id(auth.uid())
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      university_id = public.current_user_university_id(auth.uid())
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_teams_select_authenticated"
  ON public.teams FOR SELECT TO authenticated
  USING (
    public.can_access_team(id)
    OR (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = id
          AND tm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "tenant_teams_select_public"
  ON public.teams FOR SELECT TO anon
  USING (
    status IN ('approved', 'locked')
    AND EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.event_sports es ON es.event_id = e.id
      WHERE es.id = event_sport_id
        AND e.status IN ('approved', 'active', 'completed')
    )
  );

CREATE POLICY "tenant_teams_manage"
  ON public.teams FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      COALESCE(university_id, public.current_user_university_id(auth.uid())) = public.current_user_university_id(auth.uid())
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      COALESCE(university_id, public.current_user_university_id(auth.uid())) = public.current_user_university_id(auth.uid())
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_team_members_select"
  ON public.team_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_access_team(team_id)
  );

CREATE POLICY "tenant_team_members_manage"
  ON public.team_members FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_team(team_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_team(team_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_venues_select_authenticated"
  ON public.venues FOR SELECT TO authenticated
  USING (public.can_access_university(university_id));

CREATE POLICY "tenant_venues_select_public"
  ON public.venues FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "tenant_venues_manage"
  ON public.venues FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      university_id = public.current_user_university_id(auth.uid())
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      university_id = public.current_user_university_id(auth.uid())
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty')
    )
  );

CREATE POLICY "tenant_matches_select_authenticated"
  ON public.matches FOR SELECT TO authenticated
  USING (public.can_access_match(id));

CREATE POLICY "tenant_matches_select_public"
  ON public.matches FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.event_sports es ON es.event_id = e.id
      WHERE es.id = event_sport_id
        AND e.status IN ('approved', 'active', 'completed')
    )
  );

CREATE POLICY "tenant_matches_manage"
  ON public.matches FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_match(id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(COALESCE(event_id, (
        SELECT es.event_id
        FROM public.event_sports es
        WHERE es.id = event_sport_id
        LIMIT 1
      )))
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_scores_select_authenticated"
  ON public.scores FOR SELECT TO authenticated
  USING (public.can_access_match(match_id));

CREATE POLICY "tenant_scores_select_public"
  ON public.scores FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.event_sports es ON es.id = m.event_sport_id
      JOIN public.events e ON e.id = es.event_id
      WHERE m.id = match_id
        AND e.status IN ('approved', 'active', 'completed')
    )
  );

CREATE POLICY "tenant_scores_manage"
  ON public.scores FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_match(match_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_match(match_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_budgets_select"
  ON public.budgets FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR (
      public.can_access_budget(id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty')
    )
  );

CREATE POLICY "tenant_budgets_insert"
  ON public.budgets FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty')
    )
  );

CREATE POLICY "tenant_budgets_update"
  ON public.budgets FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR submitted_by = auth.uid()
    OR (
      public.can_access_budget(id)
      AND public.get_user_role(auth.uid()) = 'admin'
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR submitted_by = auth.uid()
    OR (
      public.can_access_budget(id)
      AND public.get_user_role(auth.uid()) = 'admin'
    )
  );

CREATE POLICY "tenant_budgets_delete"
  ON public.budgets FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_budget(id)
      AND public.get_user_role(auth.uid()) = 'admin'
    )
  );

CREATE POLICY "tenant_audit_logs_select"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant_audit_logs_insert"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "tenant_score_history_select"
  ON public.score_history FOR SELECT TO authenticated
  USING (public.can_access_match(match_id));

CREATE POLICY "tenant_score_history_insert"
  ON public.score_history FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_match(match_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_match_reopen_requests_select"
  ON public.match_reopen_requests FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_match(match_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty')
    )
  );

CREATE POLICY "tenant_match_reopen_requests_insert"
  ON public.match_reopen_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_match(match_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty')
    )
  );

CREATE POLICY "tenant_match_reopen_requests_update"
  ON public.match_reopen_requests FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_match(match_id)
      AND public.get_user_role(auth.uid()) = 'admin'
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_match(match_id)
      AND public.get_user_role(auth.uid()) = 'admin'
    )
  );

CREATE POLICY "tenant_registration_forms_select"
  ON public.registration_forms FOR SELECT TO authenticated
  USING (
    (
      status IN ('published', 'closed')
      AND public.can_access_event(event_id)
    )
    OR created_by = auth.uid()
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_registration_forms_manage"
  ON public.registration_forms FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_registration_submissions_select"
  ON public.registration_submissions FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR (
      public.can_access_registration_form(form_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_registration_submissions_insert"
  ON public.registration_submissions FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND public.can_access_registration_form(form_id)
  );

CREATE POLICY "tenant_registration_submissions_update"
  ON public.registration_submissions FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_registration_form(form_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_registration_form(form_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_rule_books_select"
  ON public.rule_books FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR public.is_super_admin(auth.uid())
    OR public.get_user_role(auth.uid()) = 'admin'
  );

CREATE POLICY "tenant_rule_books_manage"
  ON public.rule_books FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.get_user_role(auth.uid()) = 'admin'
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.get_user_role(auth.uid()) = 'admin'
  );

CREATE POLICY "tenant_participants_select"
  ON public.participants FOR SELECT TO authenticated
  USING (public.can_access_event(event_id));

CREATE POLICY "tenant_participants_manage"
  ON public.participants FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_group_standings_select_authenticated"
  ON public.group_standings FOR SELECT TO authenticated
  USING (public.can_access_event(event_id));

CREATE POLICY "tenant_group_standings_select_public"
  ON public.group_standings FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.status IN ('approved', 'active', 'completed')
    )
  );

CREATE POLICY "tenant_group_standings_manage"
  ON public.group_standings FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_team_standings_select_authenticated"
  ON public.team_standings FOR SELECT TO authenticated
  USING (public.can_access_event(event_id));

CREATE POLICY "tenant_team_standings_select_public"
  ON public.team_standings FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.status IN ('approved', 'active', 'completed')
    )
  );

CREATE POLICY "tenant_team_standings_manage"
  ON public.team_standings FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_league_points_select_authenticated"
  ON public.league_points FOR SELECT TO authenticated
  USING (public.can_access_event(event_id));

CREATE POLICY "tenant_league_points_select_public"
  ON public.league_points FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.status IN ('approved', 'active', 'completed')
    )
  );

CREATE POLICY "tenant_league_points_manage"
  ON public.league_points FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_team_players_select_authenticated"
  ON public.team_players FOR SELECT TO authenticated
  USING (public.can_access_event(event_id));

CREATE POLICY "tenant_team_players_select_public"
  ON public.team_players FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.status IN ('approved', 'active', 'completed')
    )
  );

CREATE POLICY "tenant_team_players_manage"
  ON public.team_players FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_event(event_id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );
