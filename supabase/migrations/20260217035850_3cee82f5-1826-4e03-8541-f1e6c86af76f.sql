
-- Create registration_forms table for dynamic form definitions
CREATE TABLE public.registration_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES public.sports_categories(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  type TEXT NOT NULL DEFAULT 'individual' CHECK (type IN ('individual', 'team')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_admin_review', 'published', 'closed', 'rejected')),
  deadline TIMESTAMP WITH TIME ZONE,
  max_slots INTEGER DEFAULT 50,
  eligibility_rules TEXT,
  form_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create registration_submissions table for form responses
CREATE TABLE public.registration_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.registration_forms(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  team_name TEXT,
  team_members JSONB,
  submission_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.registration_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_submissions ENABLE ROW LEVEL SECURITY;

-- RLS for registration_forms
CREATE POLICY "Anyone can view published forms"
  ON public.registration_forms FOR SELECT
  USING (
    status = 'published'
    OR status = 'closed'
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'student_coordinator'::app_role)
    OR has_role(auth.uid(), 'faculty'::app_role)
  );

CREATE POLICY "Student coordinators can create forms"
  ON public.registration_forms FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'student_coordinator'::app_role));

CREATE POLICY "Student coordinators can update own draft forms"
  ON public.registration_forms FOR UPDATE
  USING (
    (created_by = auth.uid() AND status = 'draft')
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can delete forms"
  ON public.registration_forms FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS for registration_submissions
CREATE POLICY "Users can view own submissions or coordinators/admin can view all"
  ON public.registration_submissions FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'student_coordinator'::app_role)
    OR has_role(auth.uid(), 'faculty'::app_role)
  );

CREATE POLICY "Authenticated users can submit"
  ON public.registration_submissions FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

-- Updated_at trigger for registration_forms
CREATE TRIGGER update_registration_forms_updated_at
  BEFORE UPDATE ON public.registration_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Create indexes for performance
CREATE INDEX idx_registration_forms_event ON public.registration_forms(event_id);
CREATE INDEX idx_registration_forms_status ON public.registration_forms(status);
CREATE INDEX idx_registration_submissions_form ON public.registration_submissions(form_id);
CREATE INDEX idx_registration_submissions_user ON public.registration_submissions(submitted_by);
