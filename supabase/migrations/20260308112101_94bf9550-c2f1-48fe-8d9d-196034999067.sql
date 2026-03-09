
-- Drop the restrictive policy that only allows updating live matches
DROP POLICY IF EXISTS "Student coordinators can update live matches" ON public.matches;

-- Create new policy allowing coordinators to update scheduled and live matches
CREATE POLICY "Student coordinators can update matches"
ON public.matches
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'student_coordinator'::app_role) 
  AND status IN ('scheduled'::match_status, 'live'::match_status)
);
