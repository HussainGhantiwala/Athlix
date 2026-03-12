import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Match } from '@/types/database';
import { TournamentBracket } from '@/components/matches/TournamentBracket';
import { StatusBadge } from '@/components/ui/status-badge';
import { Trophy, Target, Users, BarChart3 } from 'lucide-react';

interface ChampionRow {
  id: string;
  event_sport_id: string;
  winner_id: string | null;
  event_sport?: {
    event?: { name: string } | null;
    sport_category?: { name: string; icon: string | null } | null;
  } | null;
  winner?: { name: string } | null;
}

interface GroupStandingRow {
  id: string;
  event_id: string;
  group_name: string;
  team_id: string;
  played: number;
  won: number;
  lost: number;
  draw: number;
  points: number;
  goal_difference: number;
  net_run_rate: number;
  team?: { name: string; university?: { short_name: string } | null } | null;
  event?: { name: string } | null;
}

interface EventTeamTotal {
  eventId: string;
  eventName: string;
  teamCount: number;
}

export default function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [completedMatches, setCompletedMatches] = useState<Match[]>([]);
  const [groupStandings, setGroupStandings] = useState<GroupStandingRow[]>([]);
  const [champions, setChampions] = useState<ChampionRow[]>([]);
  const [selectedEventSportId, setSelectedEventSportId] = useState<string | null>(null);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [eventTeamTotals, setEventTeamTotals] = useState<EventTeamTotal[]>([]);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    const [matchesRes, standingsRes, championsRes, participantsRes, teamsRes] = await Promise.all([
      supabase
        .from('matches')
        .select(`
          *,
          team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
          team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
          event_sport:event_sports(
            id,
            event:events(name),
            sport_category:sports_categories(name, icon)
          ),
          scores(*)
        `)
        .eq('status', 'completed'),
      supabase
        .from('group_standings' as any)
        .select(`
          *,
          team:teams(name, university:universities(short_name)),
          event:events(name)
        `)
        .order('event_id')
        .order('group_name')
        .order('points', { ascending: false })
        .order('goal_difference', { ascending: false }),
      supabase
        .from('matches')
        .select(`
          id,
          event_sport_id,
          winner_id,
          event_sport:event_sports(
            event:events(name),
            sport_category:sports_categories(name, icon)
          ),
          winner:teams!matches_winner_id_fkey(name)
        `)
        .eq('status', 'completed')
        .in('round', ['round_of_16', 'quarterfinal', 'semifinal', 'final'])
        .eq('round', 'final')
        .not('winner_id', 'is', null),
      supabase
        .from('registration_submissions')
        .select('id', { count: 'exact' }),
      supabase
        .from('teams')
        .select(`
          id,
          event_sport:event_sports(
            event:events(id, name)
          )
        `),
    ]);

    setCompletedMatches((matchesRes.data as unknown as Match[]) || []);
    setGroupStandings((standingsRes.data as GroupStandingRow[]) || []);
    setTotalParticipants(participantsRes.count || 0);

    const teamsByEvent = new Map<string, EventTeamTotal>();
    (teamsRes.data || []).forEach((row: any) => {
      const event = row.event_sport?.event;
      if (!event?.id) return;
      const existing = teamsByEvent.get(event.id);
      if (existing) {
        existing.teamCount += 1;
      } else {
        teamsByEvent.set(event.id, {
          eventId: event.id,
          eventName: event.name || 'Unknown Event',
          teamCount: 1,
        });
      }
    });
    setEventTeamTotals(Array.from(teamsByEvent.values()).sort((a, b) => b.teamCount - a.teamCount));
    const championRows = (championsRes.data as ChampionRow[]) || [];
    setChampions(championRows);

    if (championRows.length) {
      setSelectedEventSportId(championRows[0].event_sport_id);
    } else if (matchesRes.data?.length) {
      setSelectedEventSportId((matchesRes.data[0] as any).event_sport_id);
    }
    setLoading(false);
  };

  const stats = useMemo(() => {
    return {
      totalTeams: eventTeamTotals.reduce((sum, item) => sum + item.teamCount, 0),
      totalParticipants,
      totalMatches: completedMatches.length,
      completedMatches: completedMatches.length,
    };
  }, [eventTeamTotals, completedMatches, totalParticipants]);

  const standingsByGroup = useMemo(() => {
    const map = new Map<string, GroupStandingRow[]>();
    groupStandings.forEach((row) => {
      const key = `${row.event_id}-${row.group_name}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries());
  }, [groupStandings]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Reports</h1>
          <p className="text-muted-foreground">Completed match outcomes, standings, brackets, and champions.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="dashboard-card p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />Total Teams</p>
            <p className="text-2xl font-display font-bold">{stats.totalTeams}</p>
          </div>
          <div className="dashboard-card p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />Total Participants</p>
            <p className="text-2xl font-display font-bold">{stats.totalParticipants}</p>
          </div>
          <div className="dashboard-card p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Target className="h-4 w-4" />Total Matches</p>
            <p className="text-2xl font-display font-bold">{stats.totalMatches}</p>
          </div>
          <div className="dashboard-card p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2"><BarChart3 className="h-4 w-4" />Completed Matches</p>
            <p className="text-2xl font-display font-bold">{stats.completedMatches}</p>
          </div>
        </div>

        <div className="dashboard-card p-5 space-y-3">
          <h2 className="text-lg font-display font-bold">Teams Per Event</h2>
          {eventTeamTotals.length ? (
            <div className="space-y-2">
              {eventTeamTotals.map((item) => (
                <div key={item.eventId} className="p-3 rounded-lg bg-muted/40 flex items-center justify-between">
                  <p className="font-medium">{item.eventName}</p>
                  <p className="text-sm text-muted-foreground">{item.teamCount} teams</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No teams found.</p>
          )}
        </div>

        <div className="dashboard-card p-5 space-y-4">
          <h2 className="text-lg font-display font-bold">Champions</h2>
          {champions.length ? (
            <div className="space-y-2">
              {champions.map((champion) => (
                <div key={champion.id} className="p-3 rounded-lg bg-muted/40 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {champion.event_sport?.sport_category?.icon} {champion.event_sport?.sport_category?.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{champion.event_sport?.event?.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-accent" />
                    <span className="font-semibold">{champion.winner?.name || 'TBD'}</span>
                    <StatusBadge status="completed" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No completed finals yet.</p>
          )}
        </div>

        <div className="dashboard-card p-5 space-y-4">
          <h2 className="text-lg font-display font-bold">Group Standings</h2>
          {standingsByGroup.length ? (
            <div className="space-y-4">
              {standingsByGroup.map(([key, rows]) => (
                <div key={key} className="space-y-2">
                  <p className="font-medium">
                    {rows[0]?.event?.name} | Group {rows[0]?.group_name}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b border-border">
                          <th className="py-2">Team</th>
                          <th className="py-2">P</th>
                          <th className="py-2">W</th>
                          <th className="py-2">L</th>
                          <th className="py-2">D</th>
                          <th className="py-2">Pts</th>
                          <th className="py-2">GD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id} className="border-b border-border/60">
                            <td className="py-2">{row.team?.name}</td>
                            <td className="py-2">{row.played}</td>
                            <td className="py-2">{row.won}</td>
                            <td className="py-2">{row.lost}</td>
                            <td className="py-2">{row.draw}</td>
                            <td className="py-2 font-semibold">{row.points}</td>
                            <td className="py-2">{row.goal_difference}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No group standings available yet.</p>
          )}
        </div>

        {selectedEventSportId && (
          <div className="dashboard-card p-5">
            <TournamentBracket eventSportId={selectedEventSportId} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
