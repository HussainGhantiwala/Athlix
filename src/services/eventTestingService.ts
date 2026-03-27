import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface GenerateTeamsRequest {
  eventId: string;
  eventSportId: string;
  teamSize: number;
  replaceExisting?: boolean;
}

export interface GenerateTeamsResponse {
  eventId: string;
  eventSportId: string;
  sportName: string;
  teamSize: number;
  teamCount: number;
  playerCount: number;
  maxTeams: number;
  replacedExisting: boolean;
  message: string;
}

export async function generateTeamsForEvent({
  eventId,
  eventSportId,
  teamSize,
  replaceExisting = true,
}: GenerateTeamsRequest): Promise<GenerateTeamsResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('You must be signed in to generate teams');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/events/${eventId}/generate-teams`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      eventSportId,
      teamSize,
      replaceExisting,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to generate teams');
  }

  return payload as GenerateTeamsResponse;
}
