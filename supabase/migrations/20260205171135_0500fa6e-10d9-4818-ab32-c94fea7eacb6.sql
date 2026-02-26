-- =============================================
-- ATHLETIX: Complete Database Schema
-- =============================================

-- 1. Create ENUM types for various statuses and roles
CREATE TYPE public.app_role AS ENUM ('admin', 'faculty', 'student_coordinator', 'student');
CREATE TYPE public.event_status AS ENUM ('draft', 'pending_approval', 'approved', 'active', 'completed', 'cancelled');
CREATE TYPE public.match_status AS ENUM ('scheduled', 'live', 'completed_provisional', 'finalized', 'cancelled');
CREATE TYPE public.registration_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.team_status AS ENUM ('forming', 'pending_approval', 'approved', 'locked');
CREATE TYPE public.budget_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- 2. Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create user_roles table (CRITICAL: Separate from profiles)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- 4. Create universities table
CREATE TABLE public.universities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    short_name TEXT NOT NULL,
    logo_url TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'India',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create events table
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    venue TEXT,
    status event_status NOT NULL DEFAULT 'draft',
    banner_url TEXT,
    registration_deadline TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create sports_categories table
CREATE TABLE public.sports_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    is_team_sport BOOLEAN NOT NULL DEFAULT true,
    min_team_size INTEGER DEFAULT 1,
    max_team_size INTEGER DEFAULT 15,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Create event_sports table (sports configured for each event)
CREATE TABLE public.event_sports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    sport_category_id UUID NOT NULL REFERENCES public.sports_categories(id) ON DELETE CASCADE,
    match_format TEXT,
    rules TEXT,
    max_teams INTEGER DEFAULT 16,
    registration_open BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, sport_category_id)
);

-- 8. Create coordinator_assignments table
CREATE TABLE public.coordinator_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL CHECK (role IN ('faculty', 'student_coordinator')),
    assigned_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, user_id)
);

-- 9. Create registrations table
CREATE TABLE public.registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_sport_id UUID NOT NULL REFERENCES public.event_sports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    university_id UUID REFERENCES public.universities(id),
    status registration_status NOT NULL DEFAULT 'pending',
    registration_data JSONB,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_sport_id, user_id)
);

-- 10. Create teams table
CREATE TABLE public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_sport_id UUID NOT NULL REFERENCES public.event_sports(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    university_id UUID REFERENCES public.universities(id),
    captain_id UUID REFERENCES auth.users(id),
    status team_status NOT NULL DEFAULT 'forming',
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Create team_members table
CREATE TABLE public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    jersey_number INTEGER,
    position TEXT,
    is_captain BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (team_id, user_id)
);

-- 12. Create venues table
CREATE TABLE public.venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID REFERENCES public.universities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    capacity INTEGER,
    location TEXT,
    facilities TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Create matches table
CREATE TABLE public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_sport_id UUID NOT NULL REFERENCES public.event_sports(id) ON DELETE CASCADE,
    venue_id UUID REFERENCES public.venues(id),
    team_a_id UUID REFERENCES public.teams(id),
    team_b_id UUID REFERENCES public.teams(id),
    scheduled_at TIMESTAMPTZ NOT NULL,
    round TEXT,
    match_number INTEGER,
    status match_status NOT NULL DEFAULT 'scheduled',
    current_editor_id UUID REFERENCES auth.users(id),
    editor_locked_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES auth.users(id),
    finalized_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. Create scores table
CREATE TABLE public.scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    score_value INTEGER NOT NULL DEFAULT 0,
    score_details JSONB,
    is_winner BOOLEAN,
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (match_id, team_id)
);

-- 15. Create budgets table
CREATE TABLE public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    estimated_amount DECIMAL(12, 2) NOT NULL,
    actual_amount DECIMAL(12, 2),
    status budget_status NOT NULL DEFAULT 'draft',
    line_items JSONB,
    submitted_by UUID REFERENCES auth.users(id),
    submitted_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. Create audit_logs table
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    reason TEXT,
    performed_by UUID REFERENCES auth.users(id),
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. Create score_history table (for tracking score changes)
CREATE TABLE public.score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    score_id UUID NOT NULL REFERENCES public.scores(id) ON DELETE CASCADE,
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    old_value INTEGER,
    new_value INTEGER NOT NULL,
    change_reason TEXT,
    changed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. Create match_reopen_requests table
CREATE TABLE public.match_reopen_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    requested_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- SECURITY: Enable RLS on all tables
-- =============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordinator_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_reopen_requests ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECURITY DEFINER FUNCTION for role checking
-- =============================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    )
$$;

-- Function to check if user is event coordinator
CREATE OR REPLACE FUNCTION public.is_event_coordinator(_user_id UUID, _event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.coordinator_assignments
        WHERE user_id = _user_id AND event_id = _event_id
    )
$$;

-- Function to get user's highest role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.user_roles
    WHERE user_id = _user_id
    ORDER BY 
        CASE role 
            WHEN 'admin' THEN 1
            WHEN 'faculty' THEN 2
            WHEN 'student_coordinator' THEN 3
            WHEN 'student' THEN 4
        END
    LIMIT 1
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles policies (only admins can manage)
CREATE POLICY "Authenticated users can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Universities policies
CREATE POLICY "Anyone can view universities" ON public.universities FOR SELECT USING (true);
CREATE POLICY "Admins can manage universities" ON public.universities FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Events policies
CREATE POLICY "Anyone can view approved events" ON public.events FOR SELECT USING (status IN ('approved', 'active', 'completed') OR auth.uid() = created_by OR public.has_role(auth.uid(), 'admin') OR public.is_event_coordinator(auth.uid(), id));
CREATE POLICY "Admins can manage all events" ON public.events FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Faculty can create events" ON public.events FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'faculty') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Coordinators can update assigned events" ON public.events FOR UPDATE TO authenticated USING (public.is_event_coordinator(auth.uid(), id));

-- Sports categories policies (public read)
CREATE POLICY "Anyone can view sports categories" ON public.sports_categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage sports categories" ON public.sports_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Event sports policies
CREATE POLICY "Anyone can view event sports" ON public.event_sports FOR SELECT USING (true);
CREATE POLICY "Admins and faculty can manage event sports" ON public.event_sports FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faculty'));

-- Coordinator assignments policies
CREATE POLICY "Authenticated can view assignments" ON public.coordinator_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage assignments" ON public.coordinator_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Registrations policies
CREATE POLICY "Users can view own registrations" ON public.registrations FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faculty') OR public.has_role(auth.uid(), 'student_coordinator'));
CREATE POLICY "Students can register" ON public.registrations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Coordinators can update registrations" ON public.registrations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faculty') OR public.has_role(auth.uid(), 'student_coordinator'));

-- Teams policies
CREATE POLICY "Anyone can view approved teams" ON public.teams FOR SELECT USING (status IN ('approved', 'locked') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faculty') OR public.has_role(auth.uid(), 'student_coordinator'));
CREATE POLICY "Student coordinators can create teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'student_coordinator') OR public.has_role(auth.uid(), 'faculty') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Coordinators can update teams" ON public.teams FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faculty') OR public.has_role(auth.uid(), 'student_coordinator'));

-- Team members policies
CREATE POLICY "Anyone can view team members" ON public.team_members FOR SELECT USING (true);
CREATE POLICY "Coordinators can manage team members" ON public.team_members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faculty') OR public.has_role(auth.uid(), 'student_coordinator'));

-- Venues policies
CREATE POLICY "Anyone can view venues" ON public.venues FOR SELECT USING (true);
CREATE POLICY "Admins and faculty can manage venues" ON public.venues FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faculty'));

-- Matches policies
CREATE POLICY "Anyone can view matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Faculty can manage matches" ON public.matches FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faculty'));
CREATE POLICY "Student coordinators can update live matches" ON public.matches FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'student_coordinator') AND status = 'live');

-- Scores policies
CREATE POLICY "Anyone can view scores" ON public.scores FOR SELECT USING (true);
CREATE POLICY "Student coordinators can update provisional scores" ON public.scores FOR UPDATE TO authenticated USING (
    (public.has_role(auth.uid(), 'student_coordinator') AND EXISTS (
        SELECT 1 FROM public.matches WHERE id = match_id AND status = 'live'
    ))
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Coordinators can insert scores" ON public.scores FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'student_coordinator')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'admin')
);

-- Budgets policies
CREATE POLICY "Coordinators can view budgets" ON public.budgets FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faculty') OR submitted_by = auth.uid());
CREATE POLICY "Faculty can create budgets" ON public.budgets FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'faculty'));
CREATE POLICY "Faculty can update own budgets" ON public.budgets FOR UPDATE TO authenticated USING (submitted_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage budgets" ON public.budgets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Audit logs policies (only admins can view)
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Score history policies
CREATE POLICY "Anyone can view score history" ON public.score_history FOR SELECT USING (true);
CREATE POLICY "Coordinators can insert score history" ON public.score_history FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'student_coordinator')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'admin')
);

-- Match reopen requests policies
CREATE POLICY "Coordinators can view reopen requests" ON public.match_reopen_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'faculty'));
CREATE POLICY "Faculty can create reopen requests" ON public.match_reopen_requests FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'faculty'));
CREATE POLICY "Admins can manage reopen requests" ON public.match_reopen_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
    
    -- Default role is student
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student');
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_universities_updated_at BEFORE UPDATE ON public.universities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_registrations_updated_at BEFORE UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_scores_updated_at BEFORE UPDATE ON public.scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Audit logging for score changes
CREATE OR REPLACE FUNCTION public.log_score_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.score_value != NEW.score_value THEN
        INSERT INTO public.score_history (score_id, match_id, old_value, new_value, changed_by)
        VALUES (NEW.id, NEW.match_id, OLD.score_value, NEW.score_value, auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_score_update
    AFTER UPDATE ON public.scores
    FOR EACH ROW EXECUTE FUNCTION public.log_score_change();

-- =============================================
-- SEED DATA: Default sports categories
-- =============================================
INSERT INTO public.sports_categories (name, icon, description, is_team_sport, min_team_size, max_team_size) VALUES
('Football', '⚽', 'Association Football/Soccer', true, 11, 18),
('Basketball', '🏀', 'Indoor/Outdoor Basketball', true, 5, 12),
('Cricket', '🏏', 'Cricket matches', true, 11, 15),
('Volleyball', '🏐', 'Indoor/Beach Volleyball', true, 6, 12),
('Badminton', '🏸', 'Singles/Doubles Badminton', false, 1, 2),
('Table Tennis', '🏓', 'Singles/Doubles Table Tennis', false, 1, 2),
('Tennis', '🎾', 'Singles/Doubles Tennis', false, 1, 2),
('Athletics', '🏃', 'Track and Field events', false, 1, 1),
('Swimming', '🏊', 'Swimming events', false, 1, 1),
('Chess', '♟️', 'Chess tournaments', false, 1, 1),
('Hockey', '🏑', 'Field Hockey', true, 11, 16),
('Kabaddi', '🤼', 'Traditional Kabaddi', true, 7, 12);

-- Enable realtime for live scores
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scores;