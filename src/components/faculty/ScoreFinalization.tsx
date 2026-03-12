import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy } from 'lucide-react';
import { Match } from '@/types/database';

export default function ScoreFinalization() {
  const [loading, setLoading] = useState(true);
  const [finishedMatches, setFinishedMatches] = useState<Match[]>([]);

  useEffect(() => {
    fetchMatches();

    const channel = supabase
      .channel('finished-matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchMatches())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMatches = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        venue:venues(name),
        event_sport:event_sports(sport_category:sports_categories(name, icon))
      `)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(20);

    setFinishedMatches((data as unknown as Match[]) || []);
    setLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Finished Matches</h1>
          <p className="text-muted-foreground">Matches are completed automatically after completion.</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : finishedMatches.length > 0 ? (
          <div className="space-y-4">
            {finishedMatches.map((match) => {
              const scoreA = match.score_a ?? match.runs_a ?? 0;
              const scoreB = match.score_b ?? match.runs_b ?? 0;
              const winnerName = match.winner_team_id === match.team_a_id
                ? match.team_a?.name
                : match.winner_team_id === match.team_b_id
                ? match.team_b?.name
                : null;

              return (
                <div key={match.id} className="dashboard-card p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-2xl">{match.event_sport?.sport_category?.icon}</span>
                      <div>
                        <p className="font-medium">{match.event_sport?.sport_category?.name}</p>
                        {match.venue && <p className="text-xs text-muted-foreground">Venue: {match.venue.name}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-sm font-medium">{match.team_a?.name}</p>
                        <p className="text-3xl font-display font-bold">{scoreA}</p>
                      </div>
                      <span className="text-muted-foreground">vs</span>
                      <div className="text-center">
                        <p className="text-sm font-medium">{match.team_b?.name}</p>
                        <p className="text-3xl font-display font-bold">{scoreB}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge status={match.status} />
                      {winnerName && <span className="text-xs font-semibold text-accent">Winner: {winnerName}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No finished matches</h3>
            <p className="text-muted-foreground">Completed matches will appear here.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
