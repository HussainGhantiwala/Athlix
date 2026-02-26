import { supabase } from '@/integrations/supabase/client';

interface RegistrationRow {
  id: string;
  event_id: string;
  user_id: string;
  team_name: string | null;
  created_at: string;
}

export class TournamentService {
  private static nextPowerOfTwo(n: number) {
    return Math.pow(2, Math.ceil(Math.log2(n)));
  }

  static async generateMatches(eventId: string) {
    const { data: registrations, error } = await supabase
      .from('registration_submissions')
      .select('id, event_id, user_id, team_name, created_at')
      .eq('event_id', eventId);

    if (error) throw error;

    if (!registrations || registrations.length < 2) {
      throw new Error('At least 2 participants required to generate matches');
    }

    await supabase
      .from('matches')
      .delete()
      .eq('event_id', eventId);

    const shuffled = [...(registrations as RegistrationRow[])].sort(() => Math.random() - 0.5);
    const participantNames = shuffled.map((row) => row.team_name || row.user_id);
    const totalParticipants = participantNames.length;
    const bracketSize = TournamentService.nextPowerOfTwo(totalParticipants);
    const totalRounds = Math.log2(bracketSize);
    const firstRoundMatches = bracketSize / 2;
    const paddedParticipants = [
      ...participantNames,
      ...Array(bracketSize - totalParticipants).fill(null),
    ] as Array<string | null>;
    const now = new Date().toISOString();

    const initialPairings = Array.from({ length: firstRoundMatches }, (_, index) => ({
      a: paddedParticipants[index] ?? null,
      b: paddedParticipants[index + firstRoundMatches] ?? null,
    }));

    const matchesToInsert: Array<{
      id: string;
      event_id: string;
      participant_a_name: string | null;
      participant_b_name: string | null;
      round: number;
      round_number: number;
      match_number: number;
      phase: 'knockout';
      next_match_id: string | null;
      status: 'scheduled';
      scheduled_at: string;
      score_data: Record<string, never>;
    }> = [];

    const rounds: string[][] = [];
    let matchNumber = 1;

    for (let round = 1; round <= totalRounds; round += 1) {
      const matchesInRound = bracketSize / Math.pow(2, round);
      const roundIds: string[] = [];

      for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex += 1) {
        const id = crypto.randomUUID();
        roundIds.push(id);

        const firstRoundPair = round === 1 ? initialPairings[matchIndex] : null;

        matchesToInsert.push({
          id,
          event_id: eventId,
          participant_a_name: firstRoundPair?.a ?? null,
          participant_b_name: firstRoundPair?.b ?? null,
          round,
          round_number: round,
          match_number: matchNumber,
          phase: 'knockout',
          next_match_id: null,
          status: 'scheduled',
          scheduled_at: now,
          score_data: {},
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
        if (match) {
          match.next_match_id = nextMatchId;
        }
      });
    }

    const { error: insertError } = await supabase
      .from('matches')
      .insert(matchesToInsert as never);

    if (insertError) throw insertError;

    const byeMatches = matchesToInsert.filter(
      (match) =>
        match.round === 1 &&
        ((!!match.participant_a_name && !match.participant_b_name) ||
          (!match.participant_a_name && !!match.participant_b_name))
    );

    for (const byeMatch of byeMatches) {
      const winnerName = byeMatch.participant_a_name || byeMatch.participant_b_name;
      if (!winnerName) continue;
      await TournamentService.endMatch(byeMatch.id, winnerName);
    }

    return matchesToInsert.length;
  }

  static async endMatch(matchId: string, winnerName: string) {
    const normalizedWinner = winnerName.trim();
    if (!normalizedWinner) {
      throw new Error('Winner name is required');
    }

    const completedAt = new Date().toISOString();

    const { data: match, error: updateError } = await supabase
      .from('matches')
      .update({
        status: 'completed',
        winner_name: normalizedWinner,
        completed_at: completedAt,
        end_time: completedAt,
      } as never)
      .eq('id', matchId)
      .select('id, next_match_id')
      .single();

    if (updateError) throw updateError;

    if (!match?.next_match_id) {
      return;
    }

    const { data: nextMatch, error: nextMatchError } = await supabase
      .from('matches')
      .select('id, participant_a_name, participant_b_name')
      .eq('id', match.next_match_id)
      .single();

    if (nextMatchError) throw nextMatchError;

    const nextSlotUpdate: {
      participant_a_name?: string;
      participant_b_name?: string;
    } = {};

    if (!nextMatch.participant_a_name) {
      nextSlotUpdate.participant_a_name = normalizedWinner;
    } else if (!nextMatch.participant_b_name) {
      nextSlotUpdate.participant_b_name = normalizedWinner;
    } else {
      return;
    }

    const { error: slotUpdateError } = await supabase
      .from('matches')
      .update(nextSlotUpdate as never)
      .eq('id', nextMatch.id);

    if (slotUpdateError) throw slotUpdateError;
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
