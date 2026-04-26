/**
 * Registration → Team Approval Bridge
 *
 * This service is the missing link between registration_submissions / registrations
 * and the teams table. When a registration is approved, this service creates the
 * corresponding team row so MatchGenerator can find it.
 */
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubmissionRow {
  id: string;
  form_id: string;
  submitted_by: string;
  team_name: string | null;
  team_members: { name: string }[] | null;
  submission_data: Record<string, any>;
  created_at: string;
}

interface FormRow {
  id: string;
  event_id: string;
  sport_id: string;
  type: string;
}

interface RegistrationRow {
  id: string;
  event_sport_id: string;
  user_id: string;
  university_id: string | null;
  registration_data: Record<string, any> | null;
}

interface BackfillResult {
  created: number;
  skipped: number;
  errors: string[];
}

// ─── Create team from a form-based registration submission ───────────────────

export async function createTeamFromSubmission(
  submission: SubmissionRow,
  form: FormRow,
  approverId: string
): Promise<{ teamId: string | null; error: string | null }> {
  try {
    // Resolve the event_sport_id from (event_id + sport_id)
    const { data: eventSport, error: esErr } = await supabase
      .from('event_sports')
      .select('id')
      .eq('event_id', form.event_id)
      .eq('sport_category_id', form.sport_id)
      .limit(1)
      .maybeSingle();

    if (esErr || !eventSport) {
      const msg = `No event_sport found for event=${form.event_id} sport=${form.sport_id}`;
      console.error('[reg-approval]', msg);
      return { teamId: null, error: msg };
    }

    const teamName = submission.team_name?.trim() || `Team-${submission.submitted_by.slice(0, 6)}`;

    // Check for existing team (prevent duplicates)
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('event_sport_id', eventSport.id)
      .eq('name', teamName)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log('[reg-approval] Team already exists, updating:', existing.id);
      await supabase.from('teams').update({
        status: 'approved',
        source: 'registered',
        registration_submission_id: submission.id,
        approved_by: approverId,
        approved_at: new Date().toISOString(),
      } as any).eq('id', existing.id);
      return { teamId: existing.id, error: null };
    }

    // Resolve university_id from the submitter's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('university_id')
      .eq('id', submission.submitted_by)
      .maybeSingle();

    // Insert the team
    const { data: newTeam, error: insertErr } = await supabase
      .from('teams')
      .insert({
        name: teamName,
        event_sport_id: eventSport.id,
        event_id: form.event_id,
        sport_id: form.sport_id,
        university_id: profile?.university_id || null,
        captain_id: submission.submitted_by,
        status: 'approved',
        source: 'registered',
        registration_submission_id: submission.id,
        created_by: submission.submitted_by,
        approved_by: approverId,
        approved_at: new Date().toISOString(),
      } as any)
      .select('id')
      .single();

    if (insertErr) {
      console.error('[reg-approval] Failed to insert team:', insertErr.message);
      return { teamId: null, error: insertErr.message };
    }

    // Insert team members as team_players (lightweight roster)
    if (newTeam && submission.team_members && submission.team_members.length > 0) {
      const playerInserts = submission.team_members.map((member, idx) => ({
        team_id: newTeam.id,
        event_id: form.event_id,
        event_sport_id: eventSport.id,
        name: member.name,
        is_dummy: false,
        created_by: submission.submitted_by,
      }));

      const { error: playersErr } = await supabase.from('team_players').insert(playerInserts);
      if (playersErr) {
        console.warn('[reg-approval] Failed to insert team players:', playersErr.message);
      }
    }

    console.log('[reg-approval] Created team:', newTeam?.id, 'name:', teamName);
    return { teamId: newTeam?.id || null, error: null };
  } catch (err: any) {
    console.error('[reg-approval] Unexpected error:', err);
    return { teamId: null, error: err.message || 'Unexpected error' };
  }
}

// ─── Create team from a legacy registration approval ─────────────────────────

export async function createTeamFromRegistration(
  registration: RegistrationRow,
  approverId: string
): Promise<{ teamId: string | null; error: string | null }> {
  try {
    // Fetch the event_sport details
    const { data: eventSport } = await supabase
      .from('event_sports')
      .select('id, event_id, sport_category_id')
      .eq('id', registration.event_sport_id)
      .single();

    if (!eventSport) {
      return { teamId: null, error: 'event_sport not found' };
    }

    // Fetch the user's name for the team name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, university_id')
      .eq('id', registration.user_id)
      .maybeSingle();

    const teamName = (registration.registration_data as any)?.team_name
      || `${profile?.full_name || 'Player'}'s Team`;

    // Check for duplicates
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('event_sport_id', eventSport.id)
      .eq('name', teamName)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log('[reg-approval] Team already exists, updating:', existing.id);
      await supabase.from('teams').update({
        status: 'approved',
        source: 'registered',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
      } as any).eq('id', existing.id);
      return { teamId: existing.id, error: null };
    }

    const { data: newTeam, error: insertErr } = await supabase
      .from('teams')
      .insert({
        name: teamName,
        event_sport_id: eventSport.id,
        event_id: eventSport.event_id,
        sport_id: eventSport.sport_category_id,
        university_id: registration.university_id || profile?.university_id || null,
        captain_id: registration.user_id,
        status: 'approved',
        source: 'registered',
        created_by: registration.user_id,
        approved_by: approverId,
        approved_at: new Date().toISOString(),
      } as any)
      .select('id')
      .single();

    if (insertErr) {
      console.error('[reg-approval] Failed to insert team:', insertErr.message);
      return { teamId: null, error: insertErr.message };
    }

    console.log('[reg-approval] Created team from registration:', newTeam?.id);
    return { teamId: newTeam?.id || null, error: null };
  } catch (err: any) {
    console.error('[reg-approval] Unexpected error:', err);
    return { teamId: null, error: err.message || 'Unexpected error' };
  }
}

// ─── Backfill: convert all approved registrations missing team rows ──────────

export async function backfillApprovedRegistrations(): Promise<BackfillResult> {
  const result: BackfillResult = { created: 0, skipped: 0, errors: [] };

  // ── Part 1: Form-based submissions ──────────────────────────────────────
  const { data: allSubmissions } = await supabase
    .from('registration_submissions')
    .select('id, form_id, submitted_by, team_name, team_members, submission_data, created_at');

  const { data: allForms } = await supabase
    .from('registration_forms')
    .select('id, event_id, sport_id, type')
    .in('status', ['approved', 'published', 'closed']);

  if (allSubmissions && allForms) {
    const formMap = new Map<string, FormRow>();
    for (const form of allForms as unknown as FormRow[]) {
      formMap.set(form.id, form);
    }

    for (const sub of allSubmissions as unknown as SubmissionRow[]) {
      const form = formMap.get(sub.form_id);
      if (!form) {
        result.skipped += 1;
        continue;
      }

      // Resolve event_sport_id
      const { data: es } = await supabase
        .from('event_sports')
        .select('id')
        .eq('event_id', form.event_id)
        .eq('sport_category_id', form.sport_id)
        .limit(1)
        .maybeSingle();

      if (!es) {
        result.skipped += 1;
        continue;
      }

      const teamName = sub.team_name?.trim() || `Team-${sub.submitted_by.slice(0, 6)}`;

      // Check if team already exists
      const { data: existing } = await supabase
        .from('teams')
        .select('id')
        .eq('event_sport_id', es.id)
        .eq('name', teamName)
        .limit(1)
        .maybeSingle();

      if (existing) {
        result.skipped += 1;
        continue;
      }

      const { error } = await createTeamFromSubmission(sub, form, 'system-backfill');
      if (error) {
        result.errors.push(`Submission ${sub.id}: ${error}`);
      } else {
        result.created += 1;
      }
    }
  }

  // ── Part 2: Legacy registrations with status='approved' ─────────────────
  const { data: approvedRegs } = await supabase
    .from('registrations')
    .select('id, event_sport_id, user_id, university_id, registration_data')
    .eq('status', 'approved');

  if (approvedRegs) {
    for (const reg of approvedRegs as unknown as RegistrationRow[]) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', reg.user_id)
        .maybeSingle();

      const teamName = (reg.registration_data as any)?.team_name
        || `${profile?.full_name || 'Player'}'s Team`;

      const { data: existing } = await supabase
        .from('teams')
        .select('id')
        .eq('event_sport_id', reg.event_sport_id)
        .eq('name', teamName)
        .limit(1)
        .maybeSingle();

      if (existing) {
        result.skipped += 1;
        continue;
      }

      const { error } = await createTeamFromRegistration(reg, 'system-backfill');
      if (error) {
        result.errors.push(`Registration ${reg.id}: ${error}`);
      } else {
        result.created += 1;
      }
    }
  }

  console.log('[reg-approval] Backfill complete:', result);
  return result;
}

// ─── Re-sync: admin-triggered re-sync (same as backfill but can be run anytime)

export const resyncApprovedRegistrations = backfillApprovedRegistrations;
