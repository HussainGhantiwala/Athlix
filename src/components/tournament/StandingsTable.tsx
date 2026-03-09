import { useEffect, useState, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TeamStanding } from '@/types/database';
import { Loader2, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StandingsTableProps {
  eventSportId: string;
}

function StandingsTableInner({ eventSportId }: StandingsTableProps) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Map<string, TeamStanding[]>>(new Map());

  useEffect(() => {
    fetchStandings();
    const channel = supabase
      .channel(`standings-${eventSportId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_standings' }, () => fetchStandings())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventSportId]);

  const fetchStandings = async () => {
    const { data } = await supabase
      .from('team_standings')
      .select('*')
      .eq('event_sport_id', eventSportId)
      .order('group_name')
      .order('points', { ascending: false })
      .order('goal_difference', { ascending: false });

    if (data) {
      const grouped = new Map<string, TeamStanding[]>();
      (data as unknown as TeamStanding[]).forEach(s => {
        const g = s.group_name || 'League';
        if (!grouped.has(g)) grouped.set(g, []);
        grouped.get(g)!.push(s);
      });
      setGroups(grouped);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (groups.size === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No standings available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([groupName, standings]) => (
        <div key={groupName} className="dashboard-card overflow-hidden">
          <div className="px-4 py-3 bg-muted/50 border-b border-border">
            <h3 className="font-display font-bold">
              {groupName === 'League' ? '🏆 League Standings' : `Group ${groupName}`}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Team</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">P</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">W</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">D</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">L</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">GD</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground font-bold">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, idx) => (
                  <tr
                    key={s.id}
                    className={cn(
                      'border-b border-border last:border-0',
                      idx < 2 && groupName !== 'League' && 'bg-accent/5'
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                        idx === 0 ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                      )}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium">{s.team_name}</td>
                    <td className="text-center px-3 py-2.5">{s.played}</td>
                    <td className="text-center px-3 py-2.5">{s.won}</td>
                    <td className="text-center px-3 py-2.5">{s.draw}</td>
                    <td className="text-center px-3 py-2.5">{s.lost}</td>
                    <td className="text-center px-3 py-2.5">{s.goal_difference > 0 ? `+${s.goal_difference}` : s.goal_difference}</td>
                    <td className="text-center px-3 py-2.5 font-bold">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

const StandingsTable = memo(StandingsTableInner);
export default StandingsTable;
