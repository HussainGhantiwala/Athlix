
-- Fix scores update policy to also work during match completion
DROP POLICY IF EXISTS "Student coordinators can update provisional scores" ON public.scores;
CREATE POLICY "Student coordinators can update provisional scores"
ON public.scores
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'student_coordinator'::app_role) AND (EXISTS (
    SELECT 1 FROM matches WHERE matches.id = scores.match_id AND matches.status IN ('live'::match_status, 'completed_provisional'::match_status)
  )))
  OR has_role(auth.uid(), 'faculty'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Also allow coordinators to update matches transitioning to completed_provisional
DROP POLICY IF EXISTS "Student coordinators can update matches" ON public.matches;
CREATE POLICY "Student coordinators can update matches"
ON public.matches
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'student_coordinator'::app_role)
  AND status IN ('scheduled'::match_status, 'live'::match_status, 'completed_provisional'::match_status)
);
