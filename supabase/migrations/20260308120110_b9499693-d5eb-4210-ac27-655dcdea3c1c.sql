
-- Drop old restrictive coordinator policy
DROP POLICY IF EXISTS "Student coordinators can update matches" ON public.matches;

-- New policy: coordinators can update matches in all active statuses (scheduled → live → completed_provisional → finalized)
CREATE POLICY "Student coordinators can update matches"
ON public.matches
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'student_coordinator'::app_role)
  AND status IN ('scheduled'::match_status, 'live'::match_status, 'completed_provisional'::match_status)
);

-- Drop the overly permissive admin/faculty ALL policy
DROP POLICY IF EXISTS "Faculty can manage matches" ON public.matches;

-- Faculty/admin can INSERT matches (for tournament generation)
CREATE POLICY "Faculty and admin can insert matches"
ON public.matches
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'faculty'::app_role)
);

-- Faculty can finalize and reopen matches (update completed_provisional → finalized, or finalized → live)
CREATE POLICY "Faculty can update matches"
ON public.matches
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'faculty'::app_role)
);

-- Admin has read-only + delete on matches (no live control)
CREATE POLICY "Admin can delete matches"
ON public.matches
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
);
