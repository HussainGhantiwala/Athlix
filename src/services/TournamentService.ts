import { supabase } from '@/integrations/supabase/client';
import { TournamentType } from '@/types/database';

interface RegistrationRow {
  id: string;
  event_id: string;
  sport_id: string;
  user_id: string;
  team_id: string | null;
  team_name: string | null;
  created_at: string;
}

interface ParticipantSeed {
  name: string;
  teamId: string | null;
  sportId: string | null;
}

type MatchState =
  | 'not_started'
  | 'first_half'
  | 'halftime'
  | 'second_half'
  | 'penalties'
  | 'finished';
type TournamentRound = 'group_stage' | 'round_of_16' | 'quarterfinal' | 'semifinal' | 'final';
type MatchResult = 'pending' | 'winner' | 'draw';

interface GeneratedMatchInsert {
  id: string;
  event_id: string;
  event_sport_id: string | null;
  sport_id: string | null;
  participant_a_name: string | null;
  participant_b_name: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  round: TournamentRound | null;
  round_number: number | null;
  match_number: number;
  phase: MatchState;
  group_name: string | null;
  group_id?: number | null;
  next_match_id: string | null;
  status: 'scheduled';
  scheduled_at: string;
  score_data: Record<string, never>;
  result: MatchResult;
}

interface CompletedMatchRow {
  group_name: string | null;
  participant_a_name: string | null;
  participant_b_name: string | null;
  result: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  winner_id: string | null;
  winner_name: string | null;
}

interface StandingAccumulator {
  played: number;
  won: number;
  lost: number;
  draw: number;
  points: number;
}

export class TournamentService {
  private static readonly KNOCKOUT_ROUNDS: TournamentRound[] = ['round_of_16', 'quarterfinal', 'semifinal', 'final'];
  private static readonly groupIdCache = new Map<string, number>();

  private static nextPowerOfTwo(n: number) {
    return Math.pow(2, Math.ceil(Math.log2(n)));
  }

  private static shuffle<T>(items: T[]): T[] {
    const cloned = [...items];
    for (let i = cloned.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
    }
    return cloned;
  }

  private static toGroupName(index: number) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return alphabet[index] ?? `G${index + 1}`;
  }

  private static toParticipantSeeds(registrations: RegistrationRow[]): ParticipantSeed[] {
    return registrations.map((row) => ({
      name: (row.team_name || row.user_id).trim(),
      teamId: row.team_id,
      sportId: row.sport_id ?? null,
    }));
  }

  private static createRoundRobinPairs(participants: ParticipantSeed[]) {
    const pairs: Array<{ a: ParticipantSeed; b: ParticipantSeed }> = [];
    for (let i = 0; i < participants.length; i += 1) {
      for (let j = i + 1; j < participants.length; j += 1) {
        pairs.push({ a: participants[i], b: participants[j] });
      }
    }
    return pairs;
  }

  private static normalizeRound(round: string | null | undefined): string {
    return String(round || '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  private static isKnockoutRound(round: string | null | undefined): boolean {
    const normalized = TournamentService.normalizeRound(round);
    return TournamentService.KNOCKOUT_ROUNDS.includes(normalized as TournamentRound);
  }

  private static getKnockoutRoundByMatchCount(matchesInRound: number): TournamentRound {
    if (matchesInRound >= 8) return 'round_of_16';
    if (matchesInRound === 4) return 'quarterfinal';
    if (matchesInRound === 2) return 'semifinal';
    return 'final';
  }

  private static async resolveGroupId(groupName: string): Promise<number> {
    if (TournamentService.groupIdCache.has(groupName)) {
      return TournamentService.groupIdCache.get(groupName)!;
    }

    const groupsClient = supabase as any;
    const withPrefix = await groupsClient
      .from('groups')
      .select('id')
      .eq('name', `Group ${groupName}`)
      .maybeSingle();
    if (withPrefix.data?.id) {
      const id = Number(withPrefix.data.id);
      TournamentService.groupIdCache.set(groupName, id);
      return id;
    }

    const plain = await groupsClient.from('groups').select('id').eq('name', groupName).maybeSingle();
    if (plain.data?.id) {
      const id = Number(plain.data.id);
      TournamentService.groupIdCache.set(groupName, id);
      return id;
    }

    throw new Error(`Group "${groupName}" not found. Create groups before generating group-stage matches.`);
  }

  private static buildKnockoutMatches(eventId: string, participants: ParticipantSeed[]) {
    const bracketSize = TournamentService.nextPowerOfTwo(participants.length);
    const totalRounds = Math.log2(bracketSize);
    const firstRoundMatches = bracketSize / 2;
    const paddedParticipants = [
      ...participants,
      ...Array(bracketSize - participants.length).fill(null),
    ] as Array<ParticipantSeed | null>;
    const now = new Date().toISOString();
    const initialPairings = Array.from({ length: firstRoundMatches }, (_, index) => ({
      a: paddedParticipants[index] ?? null,
      b: paddedParticipants[index + firstRoundMatches] ?? null,
    }));

    const matchesToInsert: GeneratedMatchInsert[] = [];
    const rounds: string[][] = [];
    let matchNumber = 1;

    for (let round = 1; round <= totalRounds; round += 1) {
      const matchesInRound = bracketSize / Math.pow(2, round);
      const roundLabel = TournamentService.getKnockoutRoundByMatchCount(matchesInRound);
      const roundIds: string[] = [];

      for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex += 1) {
        const id = crypto.randomUUID();
        roundIds.push(id);
        const pair = round === 1 ? initialPairings[matchIndex] : null;

        matchesToInsert.push({
          id,
          event_id: eventId,
          event_sport_id: null,
          sport_id: pair?.a?.sportId ?? pair?.b?.sportId ?? null,
          participant_a_name: pair?.a?.name ?? null,
          participant_b_name: pair?.b?.name ?? null,
          team_a_id: pair?.a?.teamId ?? null,
          team_b_id: pair?.b?.teamId ?? null,
          round: roundLabel,
          round_number: round,
          match_number: matchNumber,
          phase: 'not_started',
          group_name: null,
          next_match_id: null,
          status: 'scheduled',
          scheduled_at: now,
          score_data: {},
          result: 'pending',
        });

        matchNumber += 1;
      }

      rounds.push(roundIds);
    }

    const matchMap = new Map(matchesToInsert.map((match) => [match.id, match]));

    for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
      const currentRound = rounds[roundIndex];
      const nextRound = rounds[roundIndex + 1];
      currentRound.forEach((matchId, matchIndex) => {
        const nextMatchId = nextRound[Math.floor(matchIndex / 2)];
        const match = matchMap.get(matchId);
        if (match) match.next_match_id = nextMatchId;
      });
    }

    return matchesToInsert;
  }

  private static async buildGroupMatches(eventId: string, participants: ParticipantSeed[]) {
    const shuffled = TournamentService.shuffle(participants);
    const groupCount = Math.max(1, Math.ceil(shuffled.length / 4));
    const groups = Array.from({ length: groupCount }, () => [] as ParticipantSeed[]);
    shuffled.forEach((participant, index) => {
      groups[index % groupCount].push(participant);
    });

    const now = new Date().toISOString();
    const matchesToInsert: GeneratedMatchInsert[] = [];
    let matchNumber = 1;

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const groupParticipants = groups[groupIndex];
      const groupName = TournamentService.toGroupName(groupIndex);
      const groupId = await TournamentService.resolveGroupId(groupName);
      const pairs = TournamentService.createRoundRobinPairs(groupParticipants);
      pairs.forEach((pair, pairIndex) => {
        matchesToInsert.push({
          id: crypto.randomUUID(),
          event_id: eventId,
          event_sport_id: null,
          sport_id: pair.a.sportId ?? pair.b.sportId ?? null,
          participant_a_name: pair.a.name,
          participant_b_name: pair.b.name,
          team_a_id: pair.a.teamId,
          team_b_id: pair.b.teamId,
          round: 'group_stage',
          round_number: pairIndex + 1,
          match_number: matchNumber,
          phase: 'not_started',
          group_name: groupName,
          group_id: groupId,
          next_match_id: null,
          status: 'scheduled',
          scheduled_at: now,
          score_data: {},
          result: 'pending',
        });
        matchNumber += 1;
      });
    }

    return matchesToInsert;
  }

  private static buildLeagueMatches(eventId: string, participants: ParticipantSeed[]) {
    const shuffled = TournamentService.shuffle(participants);
    const pairs = TournamentService.createRoundRobinPairs(shuffled);
    const now = new Date().toISOString();

    return pairs.map((pair, index) => ({
      id: crypto.randomUUID(),
      event_id: eventId,
      event_sport_id: null,
      sport_id: pair.a.sportId ?? pair.b.sportId ?? null,
      participant_a_name: pair.a.name,
      participant_b_name: pair.b.name,
      team_a_id: pair.a.teamId,
      team_b_id: pair.b.teamId,
      round: 'group_stage' as const,
      round_number: null,
      match_number: index + 1,
      phase: 'not_started' as const,
      group_name: null,
      next_match_id: null,
      status: 'scheduled' as const,
      scheduled_at: now,
      score_data: {},
      result: 'pending' as const,
    }));
  }

  private static winnerTeamIdFromRow(match: CompletedMatchRow) {
    if (match.winner_id) return match.winner_id;
    if (!match.winner_name) return null;
    if (match.winner_name === match.participant_a_name) return match.team_a_id;
    if (match.winner_name === match.participant_b_name) return match.team_b_id;
    return null;
  }

  private static async rebuildGroupStandings(eventId: string) {
    const { error: deleteError } = await supabase
      .from('group_standings')
      .delete()
      .eq('event_id', eventId);
    if (deleteError) throw deleteError;

    const { data: groupMatches, error } = await supabase
      .from('matches')
      .select('group_name, team_a_id, team_b_id, winner_id, winner_name, participant_a_name, participant_b_name, result')
      .eq('event_id', eventId)
      .eq('round', 'group_stage')
      .not('group_name', 'is', null)
      .in('status', ['completed', 'finalized']);
    if (error) throw error;

    const standings = new Map<string, StandingAccumulator>();
    const ensure = (groupName: string, teamId: string) => {
      const key = `${groupName}::${teamId}`;
      if (!standings.has(key)) {
        standings.set(key, { played: 0, won: 0, lost: 0, draw: 0, points: 0 });
      }
      return standings.get(key)!;
    };

    ((groupMatches as CompletedMatchRow[]) || []).forEach((match) => {
      if (!match.team_a_id || !match.team_b_id) return;
      const groupName = match.group_name || 'A';
      const teamA = ensure(groupName, match.team_a_id);
      const teamB = ensure(groupName, match.team_b_id);
      teamA.played += 1;
      teamB.played += 1;

      const winnerTeamId = TournamentService.winnerTeamIdFromRow(match);
      const isDraw = !winnerTeamId || match.result === 'draw';
      if (isDraw) {
        teamA.draw += 1;
        teamB.draw += 1;
        teamA.points += 1;
        teamB.points += 1;
        return;
      }

      if (winnerTeamId === match.team_a_id) {
        teamA.won += 1;
        teamA.points += 3;
        teamB.lost += 1;
      } else if (winnerTeamId === match.team_b_id) {
        teamB.won += 1;
        teamB.points += 3;
        teamA.lost += 1;
      }
    });

    const rows = Array.from(standings.entries()).map(([key, stats]) => {
      const [groupName, teamId] = key.split('::');
      return {
        event_id: eventId,
        group_name: groupName,
        team_id: teamId,
        played: stats.played,
        won: stats.won,
        lost: stats.lost,
        draw: stats.draw,
        points: stats.points,
        goal_difference: 0,
        net_run_rate: 0,
      };
    });

    if (!rows.length) return;

    const { error: upsertError } = await supabase
      .from('group_standings')
      .upsert(rows as never, { onConflict: 'event_id,group_name,team_id' });
    if (upsertError) throw upsertError;
  }

  private static async rebuildLeaguePoints(eventId: string) {
    const { error: deleteError } = await supabase
      .from('league_points')
      .delete()
      .eq('event_id', eventId);
    if (deleteError) throw deleteError;

    const { data: leagueMatches, error } = await supabase
      .from('matches')
      .select('participant_a_name, participant_b_name, team_a_id, team_b_id, winner_name, result')
      .eq('event_id', eventId)
      .eq('round', 'group_stage')
      .is('group_name', null)
      .in('status', ['completed', 'finalized']);
    if (error) throw error;

    const points = new Map<string, StandingAccumulator & { teamId: string | null }>();
    const ensure = (name: string, teamId: string | null) => {
      if (!points.has(name)) {
        points.set(name, { teamId, played: 0, won: 0, lost: 0, draw: 0, points: 0 });
      } else if (!points.get(name)!.teamId && teamId) {
        points.get(name)!.teamId = teamId;
      }
      return points.get(name)!;
    };

    ((leagueMatches as CompletedMatchRow[]) || []).forEach((match) => {
      if (!match.participant_a_name || !match.participant_b_name) return;
      const teamA = ensure(match.participant_a_name, match.team_a_id);
      const teamB = ensure(match.participant_b_name, match.team_b_id);
      teamA.played += 1;
      teamB.played += 1;

      const isDraw = !match.winner_name || match.result === 'draw';
      if (isDraw) {
        teamA.draw += 1;
        teamB.draw += 1;
        teamA.points += 1;
        teamB.points += 1;
        return;
      }

      if (match.winner_name === match.participant_a_name) {
        teamA.won += 1;
        teamA.points += 3;
        teamB.lost += 1;
      } else if (match.winner_name === match.participant_b_name) {
        teamB.won += 1;
        teamB.points += 3;
        teamA.lost += 1;
      }
    });

    const rows = Array.from(points.entries()).map(([participantName, stats]) => ({
      event_id: eventId,
      team_id: stats.teamId,
      participant_name: participantName,
      played: stats.played,
      won: stats.won,
      lost: stats.lost,
      draw: stats.draw,
      points: stats.points,
    }));

    if (!rows.length) return;

    const { error: upsertError } = await supabase
      .from('league_points')
      .upsert(rows as never, { onConflict: 'event_id,participant_name' });
    if (upsertError) throw upsertError;
  }

  static async generateMatches(eventId: string, type: TournamentType = 'knockout') {
    const { data: registrations, error } = await supabase
      .from('registration_submissions')
      .select('id, event_id, sport_id, user_id, team_id, team_name, created_at')
      .eq('event_id', eventId);

    if (error) throw error;

    const participantSeeds = TournamentService.toParticipantSeeds(
      (registrations as RegistrationRow[]) || []
    ).filter((participant) => participant.name.length > 0);

    if (participantSeeds.length < 2) {
      throw new Error('At least 2 participants required to generate matches');
    }

    await supabase
      .from('matches')
      .delete()
      .eq('event_id', eventId);

    await supabase
      .from('group_standings')
      .delete()
      .eq('event_id', eventId);

    await supabase
      .from('league_points')
      .delete()
      .eq('event_id', eventId);

    let matchesToInsert: GeneratedMatchInsert[] = [];
    if (type === 'group') {
      matchesToInsert = await TournamentService.buildGroupMatches(eventId, participantSeeds);
    } else if (type === 'league') {
      matchesToInsert = TournamentService.buildLeagueMatches(eventId, participantSeeds);
    } else {
      matchesToInsert = TournamentService.buildKnockoutMatches(eventId, participantSeeds);
    }

    const { error: insertError } = await supabase
      .from('matches')
      .insert(matchesToInsert as never);
    if (insertError) throw insertError;

    if (type === 'knockout') {
      const byeMatches = matchesToInsert.filter(
        (match) =>
          match.round_number === 1 &&
          ((!!match.participant_a_name && !match.participant_b_name) ||
            (!match.participant_a_name && !!match.participant_b_name))
      );

      for (const byeMatch of byeMatches) {
        const winnerName = byeMatch.participant_a_name || byeMatch.participant_b_name;
        if (!winnerName) continue;
        await TournamentService.endMatch(byeMatch.id, winnerName);
      }
    }

    return matchesToInsert.length;
  }

  static async endMatch(matchId: string, winnerName: string | null = null) {
    const normalizedWinner = winnerName?.trim() || null;
    const completedAt = new Date().toISOString();

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select(`
        id,
        event_id,
        round,
        group_name,
        next_match_id,
        participant_a_name,
        participant_b_name,
        team_a_id,
        team_b_id,
        winner_id
      `)
      .eq('id', matchId)
      .single();

    if (matchError) throw matchError;

    if (TournamentService.isKnockoutRound(match.round) && !normalizedWinner) {
      throw new Error('Knockout match requires a winner');
    }

    let winnerTeamId = match.winner_id || null;
    if (normalizedWinner === match.participant_a_name) {
      winnerTeamId = match.team_a_id || winnerTeamId;
    } else if (normalizedWinner === match.participant_b_name) {
      winnerTeamId = match.team_b_id || winnerTeamId;
    }

    const { error: updateError } = await supabase
      .from('matches')
      .update({
        status: 'completed',
        winner_name: normalizedWinner,
        result: normalizedWinner ? 'winner' : 'draw',
        winner_id: winnerTeamId,
        phase: 'finished',
        completed_at: completedAt,
        end_time: completedAt,
      } as never)
      .eq('id', matchId);
    if (updateError) throw updateError;

    if (TournamentService.isKnockoutRound(match.round) && match.next_match_id && normalizedWinner) {
      const { data: nextMatch, error: nextMatchError } = await supabase
        .from('matches')
        .select('id, participant_a_name, participant_b_name, team_a_id, team_b_id')
        .eq('id', match.next_match_id)
        .single();
      if (nextMatchError) throw nextMatchError;

      const nextSlotUpdate: {
        participant_a_name?: string;
        participant_b_name?: string;
        team_a_id?: string | null;
        team_b_id?: string | null;
      } = {};

      if (!nextMatch.participant_a_name) {
        nextSlotUpdate.participant_a_name = normalizedWinner;
        nextSlotUpdate.team_a_id = winnerTeamId;
      } else if (!nextMatch.participant_b_name) {
        nextSlotUpdate.participant_b_name = normalizedWinner;
        nextSlotUpdate.team_b_id = winnerTeamId;
      }

      if (Object.keys(nextSlotUpdate).length) {
        const { error: nextSlotError } = await supabase
          .from('matches')
          .update(nextSlotUpdate as never)
          .eq('id', nextMatch.id);
        if (nextSlotError) throw nextSlotError;
      }
      return;
    }

    if (match.round === 'group_stage' && match.event_id) {
      if (match.group_name) {
        await TournamentService.rebuildGroupStandings(match.event_id);
        return;
      }
      await TournamentService.rebuildLeaguePoints(match.event_id);
    }
  }

  static async generateNextRoundIfReady(matchId: string) {
    const { data: match, error } = await supabase
      .from('matches')
      .select('winner_name')
      .eq('id', matchId)
      .single();

    if (error) throw error;
    if (!match?.winner_name) return { created: 0 };

    await TournamentService.endMatch(matchId, match.winner_name);
    return { created: 0 };
  }
}
