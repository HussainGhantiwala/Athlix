import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Match, MatchStatusEnum } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getTeamScores } from '@/lib/match-scoring';
import { cn } from '@/lib/utils';

interface TournamentBracketProps {
  eventSportId: string;
  highlightMatchId?: string;
}

const getRoundLabel = (round: string): string => {
  if (round === 'semi') return 'Semifinal';
  if (round === 'final') return 'Final';
  return round.toUpperCase();
};

export function TournamentBracket({ eventSportId, highlightMatchId }: TournamentBracketProps) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    fetchBracket();

    const channel = supabase
      .channel(`bracket-${eventSportId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `event_sport_id=eq.${eventSportId}` },
        () => fetchBracket()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => fetchBracket())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventSportId]);

  const fetchBracket = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        scores(*)
      `)
      .eq('event_sport_id', eventSportId)
      .eq('phase', 'knockout')
      .not('round', 'is', null)
      .order('round_number', { ascending: true })
      .order('match_number', { ascending: true });

    if (error) {
      setLoading(false);
      return;
    }

    setMatches((data as unknown as Match[]) || []);
    setLoading(false);
  };

  const grouped = useMemo(() => {
    const rounds = new Map<string, Match[]>();
    matches.forEach((match) => {
      if (!match.round) return;
      if (!rounds.has(match.round)) rounds.set(match.round, []);
      rounds.get(match.round)!.push(match);
    });
    const rank = (round: string) => {
      if (round === 'semi') return 1;
      if (round === 'final') return 2;
      return 99;
    };
    const entries = Array.from(rounds.entries()).sort(([a], [b]) => rank(a) - rank(b));
    return entries;
  }, [matches]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!grouped.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-display font-bold">Tournament Bracket</h3>
      <div className="overflow-x-auto pb-2">
        <div className="grid gap-4 min-w-[900px]" style={{ gridTemplateColumns: `repeat(${grouped.length}, minmax(260px, 1fr))` }}>
          {grouped.map(([round, roundMatches]) => (
            <div key={round} className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">
                {getRoundLabel(round)}
              </div>
              {roundMatches.map((match) => {
                const { teamAScore, teamBScore } = getTeamScores(match);
                const isHighlighted = highlightMatchId === match.id;
                const winnerA = match.winner_id && match.winner_id === match.team_a_id;
                const winnerB = match.winner_id && match.winner_id === match.team_b_id;

                return (
                  <div
                    key={match.id}
                    className={cn(
                      'dashboard-card p-3 space-y-2',
                      isHighlighted && 'border-accent border-2'
                    )}
                  >
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-muted-foreground">
                        Match #{match.match_number ?? '-'}
                      </div>
                      <StatusBadge status={match.status} />
                    </div>

                    <div className={cn('flex items-center justify-between text-sm', winnerA && 'font-semibold text-accent')}>
                      <span className="truncate">{match.team_a?.name || 'TBD'}</span>
                      <span>{teamAScore}</span>
                    </div>
                    <div className={cn('flex items-center justify-between text-sm', winnerB && 'font-semibold text-accent')}>
                      <span className="truncate">{match.team_b?.name || 'TBD'}</span>
                      <span>{teamBScore}</span>
                    </div>

                    {match.status === MatchStatusEnum.Finalized && (
                      <div className="text-xs text-muted-foreground pt-1 border-t border-border">
                        Winner: {winnerA ? match.team_a?.name : winnerB ? match.team_b?.name : 'Draw'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
