-- Split tenant_matches_manage (FOR ALL) so INSERT is governed only by strict tenant + profile alignment.
-- Previous FOR ALL policy OR-combined with other INSERT checks and omitted university_id = profile.university_id.

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_matches_manage" ON public.matches;
DROP POLICY IF EXISTS "tenant_matches_insert_same_university" ON public.matches;
DROP POLICY IF EXISTS "insert matches policy" ON public.matches;

CREATE POLICY "tenant_matches_manage_update"
  ON public.matches FOR UPDATE TO authenticated
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
      public.can_access_event(
        COALESCE(
          event_id,
          (
            SELECT es.event_id
            FROM public.event_sports es
            WHERE es.id = event_sport_id
            LIMIT 1
          )
        )
      )
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "tenant_matches_manage_delete"
  ON public.matches FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_access_match(id)
      AND public.get_user_role(auth.uid()) IN ('admin', 'faculty', 'student_coordinator')
    )
  );

CREATE POLICY "insert matches policy"
  ON public.matches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    university_id = (
      SELECT p.university_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  );
