import { supabase } from '@/integrations/supabase/client';

const APPROVED_FORM_STATUSES = ['approved', 'published', 'closed'];

interface ApprovedRegistrationForm {
  id: string;
  event_id: string;
  sport_id: string;
  deadline: string | null;
  max_slots: number | null;
  eligibility_rules: string | null;
}

export interface EventSportConfig {
  id: string;
  event_id: string;
  sport_category_id: string;
  sport_category: {
    name: string;
    icon: string | null;
    is_team_sport?: boolean | null;
    min_team_size?: number | null;
    max_team_size?: number | null;
  } | null;
}

export async function getEventSportsFromApprovedForms(eventId: string): Promise<{
  forms: ApprovedRegistrationForm[];
  eventSports: EventSportConfig[];
}> {
  const { data: formsData, error: formsError } = await supabase
    .from('registration_forms')
    .select('id, event_id, sport_id, deadline, max_slots, eligibility_rules')
    .eq('event_id', eventId)
    .in('status', APPROVED_FORM_STATUSES);

  if (formsError) throw formsError;

  const forms = (formsData || []) as ApprovedRegistrationForm[];
  const uniqueFormBySport = new Map<string, ApprovedRegistrationForm>();
  for (const form of forms) {
    if (!form.sport_id) continue;
    if (!uniqueFormBySport.has(form.sport_id)) {
      uniqueFormBySport.set(form.sport_id, form);
    }
  }

  const sportIds = [...uniqueFormBySport.keys()];
  if (sportIds.length === 0) {
    return { forms, eventSports: [] };
  }

  const { data: existingSports, error: existingSportsError } = await supabase
    .from('event_sports')
    .select('id, sport_category_id')
    .eq('event_id', eventId)
    .in('sport_category_id', sportIds);

  if (existingSportsError) throw existingSportsError;

  const existingSportIds = new Set((existingSports || []).map((sport) => sport.sport_category_id));
  const missingSportIds = sportIds.filter((sportId) => !existingSportIds.has(sportId));

  if (missingSportIds.length > 0) {
    const inserts = missingSportIds.map((sportId) => {
      const sourceForm = uniqueFormBySport.get(sportId);
      return {
        event_id: eventId,
        sport_category_id: sportId,
        registration_form_status: 'published' as any,
        registration_open: true,
        registration_deadline: sourceForm?.deadline || null,
        max_participants: sourceForm?.max_slots ?? null,
        eligibility_rules: sourceForm?.eligibility_rules || null,
      };
    });

    const { error: upsertError } = await supabase
      .from('event_sports')
      .upsert(inserts as any, { onConflict: 'event_id,sport_category_id' });

    if (upsertError) throw upsertError;
  }

  const { data: eventSportsData, error: eventSportsError } = await supabase
    .from('event_sports')
    .select('id, event_id, sport_category_id, sport_category:sports_categories(name, icon, is_team_sport, min_team_size, max_team_size)')
    .eq('event_id', eventId)
    .in('sport_category_id', sportIds)
    .order('created_at', { ascending: true });

  if (eventSportsError) throw eventSportsError;

  const dedupedBySport = new Map<string, EventSportConfig>();
  for (const eventSport of (eventSportsData || []) as EventSportConfig[]) {
    if (!dedupedBySport.has(eventSport.sport_category_id)) {
      dedupedBySport.set(eventSport.sport_category_id, eventSport);
    }
  }

  return { forms, eventSports: [...dedupedBySport.values()] };
}
