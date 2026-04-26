import { supabase } from '@/integrations/supabase/client';
import { Team } from '@/types/database';

function requireUniversityId(universityId: string | null | undefined): string {
  if (!universityId) {
    throw new Error('Cannot create matches: university_id is missing from your profile.');
  }
  return universityId;
}

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Fisher-Yates (Knuth) shuffle - unbiased. */
function shuffle<T>(items: T[]): T[] {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
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
    .select('id, team_a_id, team_b_id, is_placeholder, status')
    .eq('id', nextMatchId)
    .single();
  if (nextMatchError || !nextMatch) return;
  const slotUpdate: any = {};
  if (!nextMatch.team_a_id) {
    slotUpdate.team_a_id = winnerTeamId;
  } else if (!nextMatch.team_b_id) {
    slotUpdate.team_b_id = winnerTeamId;
  }
  if (Object.keys(slotUpdate).length > 0) {
    const willHaveA = slotUpdate.team_a_id || nextMatch.team_a_id;
    const willHaveB = slotUpdate.team_b_id || nextMatch.team_b_id;

    if (willHaveA && willHaveB) {
      slotUpdate.is_placeholder = false;
      slotUpdate.status = 'scheduled';
      slotUpdate.phase = MATCH_PHASE_NOT_STARTED;
    }

    await supabase.from('matches').update(slotUpdate).eq('id', nextMatchId);
  }
}

interface GenerateResult {
  success: boolean;
  error?: string;
  matchCount?: number;
}

// KNOCKOUT - Pre-creates ALL rounds with next_match_id links.
// Helper to generate a standard seeding array recursively for nice BYE distribution
function getStandardSeedOrder(bracketSize: number): number[] {
  let order = [1, 2];
  while (order.length < bracketSize) {
    const nextSize = order.length * 2;
    const nextOrder: number[] = [];
    for (const seed of order) {
      nextOrder.push(seed, nextSize + 1 - seed);
    }
    order = nextOrder;
  }
  return order;
}

// KNOCKOUT - Pre-creates ALL rounds with next_match_id links.
// Uses standard seeding distribution so BYEs are mathematically balanced.
export async function generateKnockoutMatches(
  eventSportId: string,
  eventId: string,
  teams: Team[],
  userId: string,
  universityId: string,
  scheduledAt: string
): Promise<GenerateResult> {
  if (teams.length < 2) {
    return { success: false, error: 'Need at least 2 teams for knockout.' };
  }
  const tenantUniversityId = requireUniversityId(universityId);
  const bracketSize = nextPowerOf2(teams.length);
  const totalRounds = Math.log2(bracketSize);
  
  // 1. Shuffle teams randomly for a fair draw
  const shuffled = shuffle(teams);
  
  // 2. Map seeds to teams. (Seeds > shuffled.length will be BYEs)
  const teamSeedMap = new Map<number, Team | null>();
  const seedOrder = getStandardSeedOrder(bracketSize);
  
  for (let i = 1; i <= bracketSize; i++) {
    if (i <= shuffled.length) {
      teamSeedMap.set(i, shuffled[i - 1]);
    } else {
      teamSeedMap.set(i, null);
    }
  }

  // 3. Build the structure of round slots
  const rounds: string[][] = [];
  for (let r = 0; r < totalRounds; r += 1) {
    const matchesInRound = bracketSize / Math.pow(2, r + 1);
    const ids: string[] = [];
    for (let m = 0; m < matchesInRound; m += 1) {
      ids.push(crypto.randomUUID());
    }
    rounds.push(ids);
  }

  // 4. Link next_match_ids
  const nextMatchLookup = new Map<string, string>();
  for (let r = 0; r < rounds.length - 1; r += 1) {
    for (let m = 0; m < rounds[r].length; m += 1) {
      nextMatchLookup.set(rounds[r][m], rounds[r + 1][Math.floor(m / 2)]);
    }
  }

  // 5. Match array construction
  const matchInserts: any[] = [];
  let matchNumber = 1;
  const byeMatchesList: any[] = []; // To auto-complete later

  for (let r = 0; r < rounds.length; r += 1) {
    const matchesInRound = rounds[r].length;
    const roundLabel = getKnockoutRoundByMatchCount(matchesInRound);
    
    for (let m = 0; m < matchesInRound; m += 1) {
      const id = rounds[r][m];
      const nextMatchId = nextMatchLookup.get(id) ?? null;
      
      let teamA: Team | null = null;
      let teamB: Team | null = null;
      let isByeMatch = false;

      // Assign slots only for Round 1
      if (r === 0) {
        // Pairs are adjacent in the seedOrder array
        const seedA = seedOrder[m * 2];
        const seedB = seedOrder[m * 2 + 1];
        teamA = teamSeedMap.get(seedA) || null;
        teamB = teamSeedMap.get(seedB) || null;
        
        // If one is missing, it's a BYE
        if (!teamA || !teamB) {
          isByeMatch = true;
        }
      }

      const matchObj = {
        id,
        event_sport_id: eventSportId,
        event_id: eventId,
        university_id: tenantUniversityId,
        sport_id: teamA?.sport_id ?? teamB?.sport_id ?? null,
        team_a_id: teamA?.id || null,
        team_b_id: teamB?.id || null,
        scheduled_at: scheduledAt,
        round: roundLabel,
        round_number: r + 1,
        match_number: matchNumber,
        is_bye_match: isByeMatch,
        is_placeholder: r > 0,
        phase: r > 0 ? 'not_started' : MATCH_PHASE_NOT_STARTED,
        status: isByeMatch ? 'completed' : 'scheduled',
        result_status: isByeMatch ? 'final' : 'pending',
        match_phase: isByeMatch ? 'completed' : MATCH_PHASE_NOT_STARTED,
        next_match_id: nextMatchId,
        created_by: userId,
      };

      if (isByeMatch) {
         // Auto-advance the winner
         const winnerId = teamA?.id || teamB?.id || null;
         (matchObj as any).winner_team_id = winnerId;
         (matchObj as any).winner_id = winnerId;
         (matchObj as any).completed_at = new Date().toISOString();
         byeMatchesList.push(matchObj);
      }

      matchInserts.push(matchObj);
      matchNumber += 1;
    }
  }

  // Execute insert
  const { error } = await supabase.from('matches').insert(matchInserts);
  if (error) return { success: false, error: error.message };

  // Run the placing logic sequentially for byes
  for (const byeMatch of byeMatchesList) {
    if (byeMatch.next_match_id && byeMatch.winner_id) {
      await placeWinnerInNextMatch(byeMatch.next_match_id, byeMatch.winner_id);
    }
  }

  return { success: true, matchCount: matchInserts.length };
}

// ADVANCE WINNER - Called after a knockout match completes.
// Reads the match next_match_id and places the winner into the next match slot.
export async function tryCreateNextRoundMatch(
  completedMatchId: string,
  _eventSportId: string,
  _userId: string,
  _scheduledAt: string,
  _universityId: string
): Promise<string | null> {
  const { data: match } = await supabase
    .from('matches')
    .select('id, next_match_id, winner_team_id, round')
    .eq('id', completedMatchId)
    .single();
  if (!match || !match.winner_team_id || !isKnockoutRound(match.round)) return null;
  if (!match.next_match_id) return null;
  await placeWinnerInNextMatch(match.next_match_id, match.winner_team_id);
  return match.next_match_id;
}

// END MATCH - Marks a match as completed and handles post-completion logic.
export async function endMatch(matchId: string, winnerName: string | null = null) {
  const normalizedWinner = winnerName?.trim() || null;
  const completedAt = new Date().toISOString();
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select(`
      id, event_id, event_sport_id, round, group_name,
      next_match_id, team_a_id, team_b_id, winner_id, winner_team_id,
      participant_a_name, participant_b_name,
      team_a:teams!matches_team_a_id_fkey(id, name),
      team_b:teams!matches_team_b_id_fkey(id, name)
    `)
    .eq('id', matchId)
    .single();
  if (matchError) throw matchError;
  if (isKnockoutRound(match.round) && !normalizedWinner) {
    throw new Error('Knockout match requires a winner');
  }
  let winnerTeamId = match.winner_id || match.winner_team_id || null;
  const teamAName = (match.team_a as any)?.name ?? match.participant_a_name;
  const teamBName = (match.team_b as any)?.name ?? match.participant_b_name;
  if (normalizedWinner && normalizedWinner === teamAName) {
    winnerTeamId = match.team_a_id || winnerTeamId;
  } else if (normalizedWinner && normalizedWinner === teamBName) {
    winnerTeamId = match.team_b_id || winnerTeamId;
  }
  const { error: updateError } = await supabase
    .from('matches')
    .update({
      status: 'completed',
      winner_name: normalizedWinner,
      result: normalizedWinner ? 'winner' : 'draw',
      winner_id: winnerTeamId,
      winner_team_id: winnerTeamId,
      phase: MATCH_PHASE_FINISHED,
      match_phase: 'completed',
      result_status: 'final',
      completed_at: completedAt,
      end_time: completedAt,
      current_editor_id: null,
      editor_locked_at: null,
    } as never)
    .eq('id', matchId);
  if (updateError) throw updateError;
  if (isKnockoutRound(match.round) && match.next_match_id && winnerTeamId) {
    await placeWinnerInNextMatch(match.next_match_id, winnerTeamId);
    return;
  }
  if (match.round === 'group_stage' && match.event_sport_id && match.team_a_id && match.team_b_id) {
    const { data: freshMatch } = await supabase
      .from('matches')
      .select('score_a, score_b, runs_a, runs_b')
      .eq('id', matchId)
      .single();
    if (freshMatch) {
      const scoreA = freshMatch.score_a ?? freshMatch.runs_a ?? 0;
      const scoreB = freshMatch.score_b ?? freshMatch.runs_b ?? 0;
      await updateStandingsAfterMatch(
        matchId, match.event_sport_id, match.team_a_id, match.team_b_id, scoreA, scoreB
      );
    }
  }
}

// GROUP STAGE - Round-robin within groups
export async function generateGroupMatches(
  eventSportId: string,
  eventId: string,
  teams: Team[],
  userId: string,
  universityId: string,
  scheduledAt: string
): Promise<GenerateResult> {
  if (teams.length < 4) {
    return { success: false, error: 'Need at least 4 teams for group stage.' };
  }
  const tenantUniversityId = requireUniversityId(universityId);
  const numGroups = Math.max(2, Math.ceil(teams.length / 4));
  const groupNames = 'ABCDEFGHIJKLMNOP'.split('').slice(0, numGroups);
  const shuffled = shuffle(teams);
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
          university_id: tenantUniversityId,
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

// LEAGUE - Full round-robin (no groups)
export async function generateLeagueMatches(
  eventSportId: string,
  eventId: string,
  teams: Team[],
  userId: string,
  universityId: string,
  scheduledAt: string
): Promise<GenerateResult> {
  if (teams.length < 2) {
    return { success: false, error: 'Need at least 2 teams for league.' };
  }
  const tenantUniversityId = requireUniversityId(universityId);
  const matchInserts: any[] = [];
  let matchNum = 1;
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matchInserts.push({
        event_sport_id: eventSportId,
        event_id: eventId,
        university_id: tenantUniversityId,
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

// STANDINGS - Update team_standings after a group/league match
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

// GROUP -> KNOCKOUT transition
export async function generateKnockoutFromGroupStage(
  eventSportId: string,
  eventId: string,
  userId: string,
  universityId: string,
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
  return generateKnockoutMatches(eventSportId, eventId, qualifiedTeams as any[], userId, universityId, scheduledAt);
}
