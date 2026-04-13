import { supabase } from '@/integrations/supabase/client';
import { logCacheHit, measureWithTimeout } from '@/lib/performance';

const CACHE_TTL_MS = 60 * 1000;

type CacheEntry = {
  eventIds: string[];
  eventSportIds: string[];
  expiresAt: number;
};

const scopeCache = new Map<string, CacheEntry>();
const pendingScopeLoads = new Map<string, Promise<CacheEntry>>();

async function fetchScope(universityId: string): Promise<CacheEntry> {
  const cached = scopeCache.get(universityId);
  if (cached && cached.expiresAt > Date.now()) {
    logCacheHit(`tenant scope ${universityId}`);
    return cached;
  }

  const pending = pendingScopeLoads.get(universityId);
  if (pending) {
    return pending;
  }

  const request = measureWithTimeout(`tenant scope ${universityId}`, async () => {
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id')
      .eq('university_id', universityId)
      .limit(200);

    if (eventsError) {
      throw eventsError;
    }

    const eventIds = events?.map((event) => event.id) ?? [];

    if (eventIds.length === 0) {
      return {
        eventIds: [],
        eventSportIds: [],
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
    }

    const { data: eventSports, error: eventSportsError } = await supabase
      .from('event_sports')
      .select('id')
      .in('event_id', eventIds)
      .limit(500);

    if (eventSportsError) {
      throw eventSportsError;
    }

    return {
      eventIds,
      eventSportIds: eventSports?.map((eventSport) => eventSport.id) ?? [],
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  });

  pendingScopeLoads.set(universityId, request);

  try {
    const resolved = await request;
    scopeCache.set(universityId, resolved);
    return resolved;
  } finally {
    pendingScopeLoads.delete(universityId);
  }
}

export async function getTenantScope(universityId: string) {
  return fetchScope(universityId);
}

export function clearTenantScope(universityId?: string) {
  if (universityId) {
    scopeCache.delete(universityId);
    pendingScopeLoads.delete(universityId);
    return;
  }

  scopeCache.clear();
  pendingScopeLoads.clear();
}
