
-- ================================================================
-- 1. FIX registration_forms RLS: Drop RESTRICTIVE, recreate PERMISSIVE
-- ================================================================

DROP POLICY IF EXISTS "Admins can delete forms" ON public.registration_forms;
DROP POLICY IF EXISTS "Anyone can view published forms" ON public.registration_forms;
DROP POLICY IF EXISTS "Student coordinators can create forms" ON public.registration_forms;
DROP POLICY IF EXISTS "Student coordinators can update own draft forms" ON public.registration_forms;

-- SELECT: published/closed visible to all auth users, drafts/pending visible to creator, admin, coordinator, faculty
CREATE POLICY "View registration forms"
  ON public.registration_forms FOR SELECT TO authenticated
  USING (
    status IN ('published', 'closed')
    OR created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR public.has_role(auth.uid(), 'student_coordinator')
  );

-- INSERT: only coordinators
CREATE POLICY "Coordinators can create forms"
  ON public.registration_forms FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'student_coordinator'));

-- UPDATE: coordinators can update own drafts (including submitting), admin can update any
CREATE POLICY "Update registration forms"
  ON public.registration_forms FOR UPDATE TO authenticated
  USING (
    (created_by = auth.uid() AND status IN ('draft', 'pending_admin_review'))
    OR public.has_role(auth.uid(), 'admin')
  );

-- DELETE: admin only
CREATE POLICY "Admins can delete forms"
  ON public.registration_forms FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- ================================================================
-- 2. FIX registration_submissions RLS: Drop RESTRICTIVE, recreate PERMISSIVE
-- ================================================================

DROP POLICY IF EXISTS "Authenticated users can submit" ON public.registration_submissions;
DROP POLICY IF EXISTS "Users can view own submissions or coordinators/admin can view a" ON public.registration_submissions;

-- Helper function: check if user created the form for a given submission
CREATE OR REPLACE FUNCTION public.is_form_creator(_user_id uuid, _form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registration_forms
    WHERE id = _form_id AND created_by = _user_id
  )
$$;

-- INSERT: authenticated users can submit their own
CREATE POLICY "Students can submit registrations"
  ON public.registration_submissions FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

-- SELECT: students see own only, coordinators see their forms' submissions, admin/faculty see all
CREATE POLICY "View registration submissions"
  ON public.registration_submissions FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'faculty')
    OR (public.has_role(auth.uid(), 'student_coordinator') AND public.is_form_creator(auth.uid(), form_id))
  );


-- ================================================================
-- 3. CREATE rule_books table
-- ================================================================

CREATE TABLE public.rule_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  sport_id UUID REFERENCES public.sports_categories(id),
  content TEXT NOT NULL DEFAULT '',
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by UUID,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rule_books ENABLE ROW LEVEL SECURITY;

-- SELECT: published visible to all authenticated, drafts visible to admin only
CREATE POLICY "View rule books"
  ON public.rule_books FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR public.has_role(auth.uid(), 'admin')
  );

-- INSERT: admin only
CREATE POLICY "Admins can create rule books"
  ON public.rule_books FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- UPDATE: admin only
CREATE POLICY "Admins can update rule books"
  ON public.rule_books FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- DELETE: admin only
CREATE POLICY "Admins can delete rule books"
  ON public.rule_books FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_rule_books_updated_at
  BEFORE UPDATE ON public.rule_books
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();


-- ================================================================
-- 4. Create storage bucket for rule book PDFs
-- ================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('rule-book-pdfs', 'rule-book-pdfs', true);

-- Anyone authenticated can view
CREATE POLICY "Anyone can view rule book pdfs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rule-book-pdfs');

-- Admin can upload
CREATE POLICY "Admins can upload rule book pdfs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rule-book-pdfs' AND public.has_role(auth.uid(), 'admin'));

-- Admin can delete
CREATE POLICY "Admins can delete rule book pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rule-book-pdfs' AND public.has_role(auth.uid(), 'admin'));
