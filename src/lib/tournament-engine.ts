import { supabase } from '@/integrations/supabase/client';
import { Team } from '@/types/database';

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

type TournamentRound = 'group_stage' | 'round_of_16' | 'quarterfinal' | 'semifinal' | 'final';

const MATCH_PHASE_NOT_STARTED = 'not_started';
const MATCH_PHASE_FINISHED = 'finished';
const KNOCKOUT_ROUNDS: TournamentRound[] = ['round_of_16', 'quarterfinal', 'semifinal', 'final'];
const groupIdCache = new Map<string, number>();

function normalizeRound(round: string | null | undefined): string {
  const value = String(round || '').toLowerCase().replace(/\s+/g, '_');
  if (value === 'semi' || value === 'semi_final') return 'semifinal';
  if (value === 'quarter_final') return 'quarterfinal';
  return value;
}

function getKnockoutRoundByMatchCount(matchesInRound: number): TournamentRound {
  if (matchesInRound >= 8) return 'round_of_16';
  if (matchesInRound === 4) return 'quarterfinal';
  if (matchesInRound === 2) return 'semifinal';
  return 'final';
}

function getNextKnockoutRound(round: string | null | undefined): TournamentRound | null {
  const normalized = normalizeRound(round);
  if (!normalized) return null;
  const idx = KNOCKOUT_ROUNDS.indexOf(normalized as TournamentRound);
  if (idx < 0 || idx >= KNOCKOUT_ROUNDS.length - 1) return null;
  return KNOCKOUT_ROUNDS[idx + 1];
}

function isKnockoutRound(round: string | null | undefined): boolean {
  const normalized = normalizeRound(round);
  return !!normalized && KNOCKOUT_ROUNDS.includes(normalized as TournamentRound);
}

async function resolveGroupId(groupName: string): Promise<number> {
  if (groupIdCache.has(groupName)) {
    return groupIdCache.get(groupName)!;
  }

  const groupsClient = supabase as any;
  const withPrefix = await groupsClient.from('groups').select('id').eq('name', `Group ${groupName}`).maybeSingle();
  if (withPrefix.data?.id) {
    const id = Number(withPrefix.data.id);
    groupIdCache.set(groupName, id);
    return id;
  }

  const plain = await groupsClient.from('groups').select('id').eq('name', groupName).maybeSingle();
  if (plain.data?.id) {
    const id = Number(plain.data.id);
    groupIdCache.set(groupName, id);
    return id;
  }

  throw new Error(`Group "${groupName}" not found. Create groups before generating group-stage matches.`);
}

async function placeWinnerInNextMatch(nextMatchId: string, winnerTeamId: string) {
  const { data: nextMatch, error: nextMatchError } = await supabase
    .from('matches')
    .select('id, team_a_id, team_b_id')
    .eq('id', nextMatchId)
    .single();

  if (nextMatchError || !nextMatch) return;

  const slotUpdate: { team_a_id?: string; team_b_id?: string } = {};
  if (!nextMatch.team_a_id) {
    slotUpdate.team_a_id = winnerTeamId;
  } else if (!nextMatch.team_b_id) {
    slotUpdate.team_b_id = winnerTeamId;
  }

  if (Object.keys(slotUpdate).length > 0) {
    await supabase.from('matches').update(slotUpdate).eq('id', nextMatchId);
  }
}

interface GenerateResult {
  success: boolean;
  error?: string;
  matchCount?: number;
}

/**
 * Knockout: Only generates Round 1 matches.
 * Future rounds are created dynamically when winners emerge.
 */
export async function generateKnockoutMatches(
  eventSportId: string,
  eventId: string,
  teams: Team[],
  userId: string,
  scheduledAt: string
): Promise<GenerateResult> {
  if (teams.length < 2) {
    return { success: false, error: 'Need at least 2 teams for knockout.' };
  }

  const bracketSize = nextPowerOf2(teams.length);
  const round1MatchCount = bracketSize / 2;
  const roundLabel = getKnockoutRoundByMatchCount(round1MatchCount);

  // Shuffle teams
  const shuffled = [...teams].sort(() => Math.random() - 0.5);

  // Build Round 1 slots with BYEs
  const participants: (Team | null)[] = [];
  for (let i = 0; i < bracketSize; i++) {
    participants.push(i < shuffled.length ? shuffled[i] : null);
  }

  const matchInserts: any[] = [];
  for (let i = 0; i < round1MatchCount; i++) {
    const teamA = participants[i * 2];
    const teamB = participants[i * 2 + 1];

    matchInserts.push({
      event_sport_id: eventSportId,
      event_id: eventId,
      sport_id: (teamA as any)?.sport_id ?? (teamB as any)?.sport_id ?? null,
      team_a_id: teamA?.id || null,
      team_b_id: teamB?.id || null,
      scheduled_at: scheduledAt,
      round: roundLabel,
      match_number: i + 1,
      phase: MATCH_PHASE_NOT_STARTED,
      status: 'scheduled',
      result_status: 'pending',
      match_phase: MATCH_PHASE_NOT_STARTED,
      next_match_id: null,
      created_by: userId,
    });
  }

  const { data, error } = await supabase
    .from('matches')
    .insert(matchInserts)
    .select('id, team_a_id, team_b_id, match_number');

  if (error) return { success: false, error: error.message };

  // Auto-advance BYE matches
  if (data) {
    for (const m of data) {
      const hasBye = (!m.team_a_id && m.team_b_id) || (m.team_a_id && !m.team_b_id);
      if (hasBye) {
        const winnerId = m.team_a_id || m.team_b_id;
        await supabase.from('matches').update({
          status: 'completed',
          result_status: 'final',
          winner_team_id: winnerId,
          phase: MATCH_PHASE_FINISHED,
          match_phase: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', m.id);

        // Try to create next round match if pair is also done
        await tryCreateNextRoundMatch(m.id, eventSportId, userId, scheduledAt);
      }
    }
  }

  return { success: true, matchCount: matchInserts.length };
}

/**
 * After a knockout match completes, check if the paired match also has a winner.
 * If so, create the next round match with both winners.
 */
export async function tryCreateNextRoundMatch(
  completedMatchId: string,
  eventSportId: string,
  userId: string,
  scheduledAt: string
): Promise<string | null> {
  // Get completed match
  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('id', completedMatchId)
    .single();

  if (!match || !match.winner_team_id || !isKnockoutRound(match.round)) return null;

  // If match already has next_match_id, place winner in the first empty slot.
  if (match.next_match_id) {
    await placeWinnerInNextMatch(match.next_match_id, match.winner_team_id);
    return match.next_match_id;
  }

  // Find all matches in the same round
  const { data: roundMatches } = await supabase
    .from('matches')
    .select('*')
    .eq('event_sport_id', eventSportId)
    .eq('round', match.round)
    .order('match_number');

  if (!roundMatches) return null;

  const totalInRound = roundMatches.length;

  // If only 1 match in round (it's the Final), no next round needed
  if (totalInRound === 1) return null;

  // Find pair: match_number pairs are (1,2), (3,4), (5,6)...
  const mn = match.match_number!;
  const pairNumber = mn % 2 === 1 ? mn + 1 : mn - 1;
  const pairMatch = roundMatches.find(m => m.match_number === pairNumber);

  if (!pairMatch) return null;

  // If pair already created a next match, link to it and place our winner
  if (pairMatch.next_match_id) {
    await supabase.from('matches').update({ next_match_id: pairMatch.next_match_id }).eq('id', match.id);
    await placeWinnerInNextMatch(pairMatch.next_match_id, match.winner_team_id);
    return pairMatch.next_match_id;
  }

  // If pair doesn't have a winner yet, create the next match with only our winner
  const nextRoundLabel = getNextKnockoutRound(match.round);
  if (!nextRoundLabel) return null;
  const nextMatchNumber = Math.ceil(mn / 2);
  const isFirst = mn < pairNumber;

  const teamAId = isFirst ? match.winner_team_id : (pairMatch.winner_team_id || null);
  const teamBId = isFirst ? (pairMatch.winner_team_id || null) : match.winner_team_id;

  const { data: newMatch, error } = await supabase.from('matches').insert({
    event_sport_id: eventSportId,
    event_id: match.event_id ?? null,
    sport_id: match.sport_id ?? null,
    team_a_id: teamAId,
    team_b_id: teamBId,
    scheduled_at: scheduledAt,
    round: nextRoundLabel,
    match_number: nextMatchNumber,
    phase: MATCH_PHASE_NOT_STARTED,
    status: 'scheduled',
    result_status: 'pending',
    match_phase: MATCH_PHASE_NOT_STARTED,
    next_match_id: null,
    created_by: userId,
  }).select('id').single();

  if (error || !newMatch) return null;

  // Update both feeder matches to point at the created next match.
  await Promise.all([
    supabase.from('matches').update({ next_match_id: newMatch.id }).eq('id', match.id),
    supabase.from('matches').update({ next_match_id: newMatch.id }).eq('id', pairMatch.id),
  ]);

  return newMatch.id;
}

/**
 * Legacy function kept for compatibility but now unused for knockout.
 * For knockout, use tryCreateNextRoundMatch instead.
 */
export async function advanceWinnerToNextMatch(
  currentMatchId: string,
  winnerId: string,
  nextMatchId: string,
  matchIndex: number
) {
  const slot = matchIndex % 2 === 0 ? 'team_a_id' : 'team_b_id';
  await supabase.from('matches').update({ [slot]: winnerId }).eq('id', nextMatchId);
}

export async function generateGroupMatches(
  eventSportId: string,
  eventId: string,
  teams: Team[],
  userId: string,
  scheduledAt: string
): Promise<GenerateResult> {
  if (teams.length < 4) {
    return { success: false, error: 'Need at least 4 teams for group stage.' };
  }

  const numGroups = Math.max(2, Math.ceil(teams.length / 4));
  const groupNames = 'ABCDEFGHIJKLMNOP'.split('').slice(0, numGroups);
  const shuffled = [...teams].sort(() => Math.random() - 0.5);

  const groups: Map<string, Team[]> = new Map();
  groupNames.forEach(g => groups.set(g, []));
  shuffled.forEach((team, i) => {
    const groupName = groupNames[i % numGroups];
    groups.get(groupName)!.push(team);
  });

  const matchInserts: any[] = [];
  let matchNum = 1;

  for (const [groupName, groupTeams] of groups) {
    const groupId = await resolveGroupId(groupName);

    for (let i = 0; i < groupTeams.length; i++) {
      for (let j = i + 1; j < groupTeams.length; j++) {
        matchInserts.push({
          event_sport_id: eventSportId,
          event_id: eventId,
          sport_id: (groupTeams[i] as any)?.sport_id ?? (groupTeams[j] as any)?.sport_id ?? null,
          team_a_id: groupTeams[i].id,
          team_b_id: groupTeams[j].id,
          scheduled_at: scheduledAt,
          group_id: groupId,
          round: 'group_stage',
          match_number: matchNum++,
          phase: MATCH_PHASE_NOT_STARTED,
          match_phase: MATCH_PHASE_NOT_STARTED,
          group_name: groupName,
          status: 'scheduled',
          result_status: 'pending',
          created_by: userId,
        });
      }
    }

    const standingsInserts = groupTeams.map(team => ({
      event_id: eventId,
      event_sport_id: eventSportId,
      group_name: groupName,
      team_id: team.id,
      team_name: team.name,
    }));

    await supabase.from('team_standings').insert(standingsInserts);
  }

  const { error } = await supabase.from('matches').insert(matchInserts);
  if (error) return { success: false, error: error.message };

  return { success: true, matchCount: matchInserts.length };
}

export async function generateLeagueMatches(
  eventSportId: string,
  eventId: string,
  teams: Team[],
  userId: string,
  scheduledAt: string
): Promise<GenerateResult> {
  if (teams.length < 2) {
    return { success: false, error: 'Need at least 2 teams for league.' };
  }

  const matchInserts: any[] = [];
  let matchNum = 1;

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matchInserts.push({
        event_sport_id: eventSportId,
        event_id: eventId,
        sport_id: (teams[i] as any)?.sport_id ?? (teams[j] as any)?.sport_id ?? null,
        team_a_id: teams[i].id,
        team_b_id: teams[j].id,
        scheduled_at: scheduledAt,
        round: 'group_stage',
        match_number: matchNum++,
        phase: MATCH_PHASE_NOT_STARTED,
        match_phase: MATCH_PHASE_NOT_STARTED,
        status: 'scheduled',
        result_status: 'pending',
        created_by: userId,
      });
    }
  }

  const standingsInserts = teams.map(team => ({
    event_id: eventId,
    event_sport_id: eventSportId,
    team_id: team.id,
    team_name: team.name,
  }));

  await supabase.from('team_standings').insert(standingsInserts);

  const { error } = await supabase.from('matches').insert(matchInserts);
  if (error) return { success: false, error: error.message };

  return { success: true, matchCount: matchInserts.length };
}

export async function updateStandingsAfterMatch(
  matchId: string,
  eventSportId: string,
  teamAId: string,
  teamBId: string,
  scoreA: number,
  scoreB: number
) {
  const updateTeam = async (teamId: string, won: boolean, lost: boolean, isDraw: boolean, gd: number) => {
    const { data } = await supabase
      .from('team_standings')
      .select('*')
      .eq('event_sport_id', eventSportId)
      .eq('team_id', teamId)
      .single();

    if (!data) return;

    await supabase.from('team_standings').update({
      played: (data as any).played + 1,
      won: (data as any).won + (won ? 1 : 0),
      lost: (data as any).lost + (lost ? 1 : 0),
      draw: (data as any).draw + (isDraw ? 1 : 0),
      points: (data as any).points + (won ? 3 : isDraw ? 1 : 0),
      goal_difference: (data as any).goal_difference + gd,
    }).eq('id', (data as any).id);
  };

  if (scoreA > scoreB) {
    await updateTeam(teamAId, true, false, false, scoreA - scoreB);
    await updateTeam(teamBId, false, true, false, scoreB - scoreA);
  } else if (scoreB > scoreA) {
    await updateTeam(teamAId, false, true, false, scoreA - scoreB);
    await updateTeam(teamBId, true, false, false, scoreB - scoreA);
  } else {
    await updateTeam(teamAId, false, false, true, 0);
    await updateTeam(teamBId, false, false, true, 0);
  }
}

export async function generateKnockoutFromGroupStage(
  eventSportId: string,
  eventId: string,
  userId: string,
  scheduledAt: string
): Promise<GenerateResult> {
  const { data: standings } = await supabase
    .from('team_standings')
    .select('*')
    .eq('event_sport_id', eventSportId)
    .order('group_name')
    .order('points', { ascending: false })
    .order('goal_difference', { ascending: false });

  if (!standings || standings.length === 0) {
    return { success: false, error: 'No standings found.' };
  }

  const groups = new Map<string, any[]>();
  (standings as any[]).forEach(s => {
    const g = s.group_name || 'A';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  });

  const qualifiedTeamIds: string[] = [];
  for (const [, groupStandings] of groups) {
    qualifiedTeamIds.push(...groupStandings.slice(0, 2).map((s: any) => s.team_id));
  }

  const { data: qualifiedTeams } = await supabase
    .from('teams')
    .select('*')
    .in('id', qualifiedTeamIds);

  if (!qualifiedTeams || qualifiedTeams.length < 2) {
    return { success: false, error: 'Not enough qualified teams.' };
  }

  return generateKnockoutMatches(eventSportId, eventId, qualifiedTeams as any[], userId, scheduledAt);
}
