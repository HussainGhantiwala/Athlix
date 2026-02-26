
-- 1. Create registration form workflow status enum
CREATE TYPE public.registration_form_status AS ENUM (
  'draft',
  'pending_faculty_review', 
  'pending_admin_approval',
  'published',
  'closed',
  'rejected'
);

-- 2. Add registration workflow columns to event_sports
ALTER TABLE public.event_sports 
  ADD COLUMN registration_form_status public.registration_form_status DEFAULT 'draft',
  ADD COLUMN registration_deadline TIMESTAMP WITH TIME ZONE,
  ADD COLUMN max_participants INTEGER DEFAULT 50,
  ADD COLUMN eligibility_rules TEXT,
  ADD COLUMN form_created_by UUID;

-- 3. Allow student coordinators to update event_sports for registration form management
CREATE POLICY "Student coordinators can update event sports"
  ON public.event_sports
  FOR UPDATE
  USING (has_role(auth.uid(), 'student_coordinator'::app_role));

-- 4. Allow student coordinators to insert event_sports (for creating registration forms)
CREATE POLICY "Student coordinators can insert event sports"
  ON public.event_sports
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'student_coordinator'::app_role));

-- 5. Add unique constraint on scores for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS scores_match_team_unique ON public.scores (match_id, team_id);
