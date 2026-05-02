import { supabase } from '@/integrations/supabase/client';
import { Team } from '@/types/database';

/**
 * Deterministic Knockout Tournament Generator
 * Follows strict seeding and structural rules.
 */

export interface BracketMatch {
  id: string;
  teamA: Team | null;
  teamB: Team | null;
  isByeMatch: boolean;
  winner: Team | null;
  nextMatchId: string | null;
  roundName: string;
  roundNumber: number;
}

export interface BracketRound {
  roundName: string;
  matches: BracketMatch[];
}

export interface SeedMapping {
  seed: number;
  teamName: string;
}

export interface BracketOutput {
  bracketSize: number;
  byes: number;
  rounds: BracketRound[];
  seedMapping?: SeedMapping[];
}

/**
 * Ensures bracket slots are a power of 2.
 */
export function nextPowerOf2(n: number): number {
  if (n <= 0) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Generates standard tournament seed positions algorithmically.
 * Ensures Seed 1 and 2 are on opposite halves, and top seeds are correctly distributed.
 */
export function generateSeedPositions(n: number): number[] {
  if (n === 2) return [1, 2];

  const prev = generateSeedPositions(n / 2);
  const result: number[] = [];

  for (const p of prev) {
    result.push(p);
    result.push(n + 1 - p);
  }

  // ✅ CRITICAL: Fix pairing blocks
  for (let i = 0; i < result.length; i += 4) {
    if (i + 3 < result.length) {
      [result[i + 2], result[i + 3]] = [result[i + 3], result[i + 2]];
    }
  }

  return result;
}

/**
 * Returns user-friendly round names based on the current round and total rounds.
 */
export function getRoundName(matchesInRound: number, totalRounds: number, currentRound: number): string {
  if (currentRound === totalRounds) return "Final";
  if (currentRound === totalRounds - 1) return "Semifinal";
  if (currentRound === totalRounds - 2) return "Quarterfinal";
  return `Round of ${matchesInRound * 2}`;
}

/**
 * Fetches seeding from the previous year's tournament if available.
 * Seed 1 = Winner, Seed 2 = Runner-up, Seed 3 = Second runner-up.
 */
export async function fetchPreviousYearSeeding(
  currentEventSportId: string,
  universityId: string
): Promise<Record<string, number>> {
  // 1. Get current sport category
  const { data: currentES } = await supabase
    .from('event_sports')
    .select('sport_category_id')
    .eq('id', currentEventSportId)
    .single();

  if (!currentES) return {};

  // 2. Find the most recent completed event with the same sport
  const { data: prevES } = await supabase
    .from('event_sports')
    .select('id, event_id, events(end_date)')
    .eq('sport_category_id', currentES.sport_category_id)
    .neq('id', currentEventSportId)
    .order('created_at', { ascending: false })
    .limit(5); // Check recent ones

  if (!prevES || prevES.length === 0) return {};

  // We need to find one that is completed
  let targetESId = null;
  for (const es of prevES) {
    const { data: event } = await supabase
      .from('events')
      .select('status')
      .eq('id', es.event_id)
      .single();
    if (event?.status === 'completed') {
      targetESId = es.id;
      break;
    }
  }

  if (!targetESId) return {};

  // 3. Find Final and potentially 3rd place match
  const { data: matches } = await supabase
    .from('matches')
    .select('team_a_id, team_b_id, winner_team_id, round, score_a, score_b')
    .eq('event_sport_id', targetESId)
    .in('round', ['final', 'semifinal']) // We might need semis to deduce 3rd if no 3rd place match
    .order('round', { ascending: false });

  if (!matches) return {};

  const seeding: Record<string, number> = {};
  const finalMatch = matches.find(m => m.round === 'final');

  if (finalMatch && finalMatch.winner_team_id) {
    // Fetch university_id for the winner
    const { data: winnerTeam } = await supabase.from('teams').select('university_id').eq('id', finalMatch.winner_team_id).single();
    if (winnerTeam?.university_id) seeding[winnerTeam.university_id] = 1;

    const runnerUpId = finalMatch.winner_team_id === finalMatch.team_a_id ? finalMatch.team_b_id : finalMatch.team_a_id;
    if (runnerUpId) {
      const { data: runnerUpTeam } = await supabase.from('teams').select('university_id').eq('id', runnerUpId).single();
      if (runnerUpTeam?.university_id) seeding[runnerUpTeam.university_id] = 2;
    }
  }

  // Look for 3rd place match
  const { data: thirdPlaceMatch } = await supabase
    .from('matches')
    .select('winner_team_id')
    .eq('event_sport_id', targetESId)
    .eq('round', 'third_place')
    .maybeSingle();

  if (thirdPlaceMatch?.winner_team_id) {
    const { data: thirdTeam } = await supabase.from('teams').select('university_id').eq('id', thirdPlaceMatch.winner_team_id).single();
    if (thirdTeam?.university_id) seeding[thirdTeam.university_id] = 3;
  } else {
    const semiLosers = matches
      .filter(m => m.round === 'semifinal')
      .map(m => m.winner_team_id === m.team_a_id ? m.team_b_id : m.team_a_id)
      .filter(id => id !== null) as string[];

    if (semiLosers.length > 0) {
      const { data: thirdTeam } = await supabase.from('teams').select('university_id').eq('id', semiLosers[0]).single();
      if (thirdTeam?.university_id) seeding[thirdTeam.university_id] = 3;
    }
  }

  return seeding;
}

/**
 * Main generation logic for a universal deterministic knockout bracket.
 * Handles any number of teams (>= 2).
 */
export function generateKnockoutBracket(
  teams: Team[],
  manualSeeding?: Record<string, number>
): BracketOutput {
  const teamCount = teams.length;
  if (teamCount < 2) {
    throw new Error("Need at least 2 teams for a tournament.");
  }

  // 1. Bracket size (power of 2)
  const bracketSize = nextPowerOf2(teamCount);
  const byes = bracketSize - teamCount;
  const totalRounds = Math.log2(bracketSize);

  // 2. Map teams to seeds (Ranks 1 to teamCount)
  const seedingMap = { ...manualSeeding };
  if (Object.keys(seedingMap).length === 0) {
    teams.forEach(t => {
      if (t.seed_position) seedingMap[t.id] = t.seed_position;
    });
  }

  const teamWithSeeds: { team: Team, seed: number }[] = [];
  const unseededTeams: Team[] = [];
  const takenSeeds = new Set<number>();

  teams.forEach(t => {
    const seed = seedingMap[t.id];

    if (seed && seed > 0 && seed <= teamCount && !takenSeeds.has(seed)) {
      teamWithSeeds.push({ team: t, seed });
      takenSeeds.add(seed);
    } else {
      unseededTeams.push(t);
    }
  });

  const availableRanks: number[] = [];
  for (let s = 1; s <= teamCount; s++) {
    if (!takenSeeds.has(s)) {
      availableRanks.push(s);
    }
  }

  unseededTeams.forEach(t => {
    const rank = availableRanks.shift();
    if (rank !== undefined) {
      teamWithSeeds.push({ team: t, seed: rank });
    }
  });

  // Create a map for quick lookup by seed
  const seedToTeam = new Map<number, Team>();
  teamWithSeeds.forEach(ts => seedToTeam.set(ts.seed, ts.team));

  const seedPositions = generateSeedPositions(bracketSize);

  // 🔍 DEBUG HERE
  console.log("Seed Positions:", seedPositions);
  console.log(
    "Seed Mapping:",
    Array.from(seedToTeam.entries()).map(([k, v]) => ({
      seed: k,
      team: v.name
    }))
  );
  // 4. Place into bracket using exactly the prompt's rule
  const bracketSlots: (Team | null)[] = new Array(bracketSize).fill(null);

  for (let i = 0; i < bracketSize; i++) {
    const pos = seedPositions[i];
    if (pos > teamCount) {
      bracketSlots[i] = null; // BYE
    } else {
      bracketSlots[i] = seedToTeam.get(pos) || null;
    }
  }

  // 5. Build rounds and matches
  const rounds: BracketRound[] = [];
  const matchIdMap = new Map<string, string>();

  // Pre-generate IDs
  for (let r = 1; r <= totalRounds; r++) {
    const numMatches = bracketSize / Math.pow(2, r);
    for (let m = 0; m < numMatches; m++) {
      matchIdMap.set(`${r}_${m}`, crypto.randomUUID());
    }
  }

  let currentRoundSlots = [...bracketSlots];

  for (let r = 1; r <= totalRounds; r++) {
    const numMatches = bracketSize / Math.pow(2, r);
    const roundName = getRoundName(numMatches, totalRounds, r);
    const matches: BracketMatch[] = [];
    const nextRoundSlots: (Team | null)[] = new Array(numMatches).fill(null);

    for (let m = 0; m < numMatches; m++) {
      const id = matchIdMap.get(`${r}_${m}`)!;
      const nextMatchId = matchIdMap.get(`${r + 1}_${Math.floor(m / 2)}`) || null;

      const teamA = currentRoundSlots[m * 2];
      const teamB = currentRoundSlots[m * 2 + 1];

      let isByeMatch = false;
      let winner: Team | null = null;
      let skipMatch = false;

      if (r === 1) {
        if (teamA === null && teamB === null) {
          skipMatch = true; // DO NOT create match
        } else if (teamA === null || teamB === null) {
          isByeMatch = true;
          winner = teamA || teamB;
        }
      } else {
        // For r > 1, null teams mean they are TBD from previous rounds.
        isByeMatch = false;
        winner = null;
      }

      nextRoundSlots[m] = null; // The winner (or TBD) advances

      if (!skipMatch) {
        matches.push({
          id,
          teamA,
          teamB,
          isByeMatch,
          winner,
          nextMatchId,
          roundName,
          roundNumber: r
        });
      }
    }

    rounds.push({
      roundName,
      matches
    });

    currentRoundSlots = nextRoundSlots;
  }

  // Strict Validations
  let realMatchesCount = 0;
  rounds.forEach(round => {
    round.matches.forEach(m => {
      if (!m.isByeMatch) realMatchesCount++;
    });
  });

  if (realMatchesCount !== teamCount - 1) {
    throw new Error(`Validation Error: Missing matches. Expected ${teamCount - 1}, found ${realMatchesCount}`);
  }

  const uniqueTeams = new Set(teamWithSeeds.map(ts => ts.team.id));
  if (uniqueTeams.size !== teamCount) {
    throw new Error("Validation Error: Duplicate teams found.");
  }

  if (bracketSize > 2 && seedPositions[0] === 1 && seedPositions[1] === 2) {
    throw new Error("Validation Error: Seeds placed sequentially.");
  }

  const seedMapping = teamWithSeeds.map(ts => ({
    seed: ts.seed,
    teamName: ts.team.name || 'Unknown Team'
  }));

  return {
    bracketSize,
    byes,
    rounds,
    seedMapping
  };
}
