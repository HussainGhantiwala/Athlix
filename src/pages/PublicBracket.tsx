import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';

type RoundEntry = {
  round: number;
  matches: Match[];
};

const getRoundLabel = (round: number, totalRounds: number) => {
  if (round === totalRounds) return 'Final';
  if (round === totalRounds - 1) return 'Semifinal';
  if (round === totalRounds - 2) return 'Quarterfinal';
  return `Round ${round}`;
};

export default function PublicBracket() {
  const { eventId } = useParams<{ eventId: string }>();
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState<string>('Tournament Bracket');
  const [matches, setMatches] = useState<Match[]>([]);

  const fetchBracket = async () => {
    if (!eventId) return;
    setLoading(true);

    const [{ data: event }, { data: bracketMatches, error: bracketError }] = await Promise.all([
      supabase.from('events').select('name').eq('id', eventId).maybeSingle(),
      supabase
        .from('matches')
        .select(`
          id,
          event_id,
          round,
          round_number,
          match_number,
          status,
          participant_a_name,
          participant_b_name,
          winner_name,
          next_match_id,
          scheduled_at
        `)
        .eq('event_id', eventId)
        .eq('phase', 'knockout')
        .order('round', { ascending: true })
        .order('match_number', { ascending: true }),
    ]);

    if (event?.name) {
      setEventName(event.name);
    }

    if (bracketError) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setMatches((bracketMatches as unknown as Match[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    void fetchBracket();
    if (!eventId) return;

    const channel = supabase
      .channel(`public-bracket-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `event_id=eq.${eventId}` }, () => {
        void fetchBracket();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const rounds = useMemo<RoundEntry[]>(() => {
    const grouped = new Map<number, Match[]>();

    matches.forEach((match) => {
      const rawRound = match.round_number ?? Number(match.round);
      if (!rawRound || Number.isNaN(rawRound)) return;
      if (!grouped.has(rawRound)) grouped.set(rawRound, []);
      grouped.get(rawRound)!.push(match);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, roundMatches]) => ({
        round,
        matches: [...roundMatches].sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0)),
      }));
  }, [matches]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">Knockout Bracket</h1>
            <p className="text-muted-foreground">{eventName}</p>
          </div>
          <Link to="/">
            <Button variant="outline">Back to Scoreboard</Button>
          </Link>
        </div>

        {!rounds.length ? (
          <div className="dashboard-card p-8 text-center">
            <h2 className="text-lg font-semibold">No bracket matches found</h2>
            <p className="text-muted-foreground mt-1">Generate matches for this event to render the bracket.</p>
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="bracket min-w-max">
              {rounds.map((round, index) => {
                const isFinalRound = index === rounds.length - 1;

                return (
                  <div key={round.round} className={`round ${isFinalRound ? 'final-round' : ''}`}>
                    <div className="text-sm font-medium text-muted-foreground mb-2">
                      {getRoundLabel(round.round, rounds.length)}
                    </div>

                    {round.matches.map((match) => {
                      const participantA = match.participant_a_name || 'TBD';
                      const participantB = match.participant_b_name || 'TBD';
                      const winner = match.winner_name || null;
                      const isWinnerA = !!winner && winner === participantA;
                      const isWinnerB = !!winner && winner === participantB;

                      return (
                        <div key={match.id} className="dashboard-card p-3 space-y-2 w-[260px]">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              Match #{match.match_number ?? '-'}
                            </span>
                            <StatusBadge status={match.status} />
                          </div>

                          <div className={`flex items-center justify-between text-sm ${isWinnerA ? 'font-semibold text-accent' : ''}`}>
                            <span className="truncate pr-2">{participantA}</span>
                          </div>
                          <div className={`flex items-center justify-between text-sm ${isWinnerB ? 'font-semibold text-accent' : ''}`}>
                            <span className="truncate pr-2">{participantB}</span>
                          </div>

                          {winner && (
                            <div className="text-xs text-muted-foreground pt-1 border-t border-border">
                              Winner: {winner}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
