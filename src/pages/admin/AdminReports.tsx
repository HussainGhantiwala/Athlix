import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Match } from '@/types/database';
import { TournamentBracket } from '@/components/matches/TournamentBracket';
import { StatusBadge } from '@/components/ui/status-badge';
import { Activity, BarChart3, FileText, ShieldCheck, Target, Trophy, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const REPORT_ALLOWED_ROLES = ['admin', 'super_admin', 'student_coordinator', 'coordinator'] as const;
const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '12px',
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08)',
};

interface ReportMatchRow extends Match {
  team_a?: {
    id: string;
    name: string | null;
    university?: { short_name: string | null } | null;
  } | null;
  team_b?: {
    id: string;
    name: string | null;
    university?: { short_name: string | null } | null;
  } | null;
  event_sport?: {
    id: string;
    event?: { name: string; university_id?: string | null } | null;
    sport_category?: { name: string; icon: string | null } | null;
  } | null;
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
  team?: {
    name: string | null;
    university?: { short_name: string | null } | null;
  } | null;
  event?: {
    id: string;
    name: string;
    university_id: string | null;
  } | null;
}

interface TeamReportRow {
  id: string;
  university_id: string | null;
  event_sport?: {
    event?: {
      id: string;
      name: string;
      university_id?: string | null;
    } | null;
  } | null;
}

export default function AdminReports() {
  const { role, universityId, university } = useAuth();
  const canViewReports =
    !!role && REPORT_ALLOWED_ROLES.includes(role as (typeof REPORT_ALLOWED_ROLES)[number]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedMatches, setCompletedMatches] = useState<ReportMatchRow[]>([]);
  const [groupStandings, setGroupStandings] = useState<GroupStandingRow[]>([]);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [eventTeamRows, setEventTeamRows] = useState<TeamReportRow[]>([]);
  const [selectedEventSportId, setSelectedEventSportId] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const fetchReports = useCallback(
    async (withLoader = true) => {
      if (!canViewReports) {
        setLoading(false);
        return;
      }

      if (role !== 'super_admin' && !universityId) {
        setLoading(false);
        return;
      }

      if (withLoader) {
        setLoading(true);
      }

      setError(null);

      const baseMatchesQuery = supabase
        .from('matches')
        .select(`
          id,
          university_id,
          event_sport_id,
          status,
          scheduled_at,
          round,
          match_number,
          team_a_id,
          team_b_id,
          winner_team_id,
          team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
          team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
          event_sport:event_sports(
            id,
            event:events(name, university_id),
            sport_category:sports_categories(name, icon)
          )
        `)
        .in('status', ['completed', 'completed_provisional', 'finalized'])
        .order('scheduled_at', { ascending: false });

      const baseStandingsQuery = supabase
        .from('group_standings' as any)
        .select(`
          id,
          event_id,
          group_name,
          team_id,
          played,
          won,
          lost,
          draw,
          points,
          goal_difference,
          net_run_rate,
          team:teams(name, university:universities(short_name)),
          event:events!inner(id, name, university_id)
        `)
        .order('event_id')
        .order('group_name')
        .order('points', { ascending: false })
        .order('goal_difference', { ascending: false });

      const baseRegistrationsQuery = supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true });

      const baseTeamsQuery = supabase
        .from('teams')
        .select(`
          id,
          university_id,
          event_sport:event_sports(
            event:events(id, name, university_id)
          )
        `);

      const matchesQuery =
        role === 'super_admin' ? baseMatchesQuery : baseMatchesQuery.eq('university_id', universityId);
      const standingsQuery =
        role === 'super_admin' ? baseStandingsQuery : baseStandingsQuery.eq('event.university_id', universityId);
      const registrationsQuery =
        role === 'super_admin'
          ? baseRegistrationsQuery
          : baseRegistrationsQuery.eq('university_id', universityId);
      const teamsQuery =
        role === 'super_admin' ? baseTeamsQuery : baseTeamsQuery.eq('university_id', universityId);

      const [matchesRes, standingsRes, participantsRes, teamsRes] = await Promise.all([
        matchesQuery,
        standingsQuery,
        registrationsQuery,
        teamsQuery,
      ]);

      const queryError = matchesRes.error || standingsRes.error || participantsRes.error || teamsRes.error;
      if (queryError) {
        setError(queryError.message);
        setLoading(false);
        return;
      }

      const nextMatches = (matchesRes.data as ReportMatchRow[] | null) ?? [];
      setCompletedMatches(nextMatches);
      setGroupStandings((standingsRes.data as GroupStandingRow[] | null) ?? []);
      setTotalParticipants(participantsRes.count || 0);
      setEventTeamRows((teamsRes.data as TeamReportRow[] | null) ?? []);
      setSelectedEventSportId((current) => current || nextMatches[0]?.event_sport_id || null);
      setRefreshedAt(new Date().toISOString());
      setLoading(false);
    },
    [canViewReports, role, universityId],
  );

  useEffect(() => {
    void fetchReports(true);
  }, [fetchReports]);

  useEffect(() => {
    if (!canViewReports) {
      return;
    }

    const channel = supabase
      .channel(`reports-live-${role ?? 'unknown'}-${universityId ?? 'global'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        void fetchReports(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_standings' }, () => {
        void fetchReports(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        void fetchReports(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        void fetchReports(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canViewReports, fetchReports, role, universityId]);

  const championRows = useMemo(() => {
    return completedMatches.filter(
      (match) =>
        match.round === 'final' &&
        !!match.winner_team_id &&
        ['completed', 'completed_provisional', 'finalized'].includes(match.status),
    );
  }, [completedMatches]);

  const eventTeamTotals = useMemo(() => {
    const teamsByEvent = new Map<string, { eventId: string; eventName: string; teamCount: number }>();

    eventTeamRows.forEach((row) => {
      const event = row.event_sport?.event;
      if (!event?.id) {
        return;
      }

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

    return Array.from(teamsByEvent.values()).sort((a, b) => b.teamCount - a.teamCount);
  }, [eventTeamRows]);

  const standingsByGroup = useMemo(() => {
    const grouped = new Map<string, GroupStandingRow[]>();

    groupStandings.forEach((row) => {
      const key = `${row.event_id}-${row.group_name}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(row);
    });

    return Array.from(grouped.entries());
  }, [groupStandings]);

  const stats = useMemo(() => {
    return {
      totalTeams: eventTeamRows.length,
      totalParticipants,
      totalMatches: completedMatches.length,
      completedMatches: completedMatches.length,
      champions: championRows.length,
      activeGroups: standingsByGroup.length,
    };
  }, [championRows.length, completedMatches.length, eventTeamRows.length, standingsByGroup.length, totalParticipants]);

  const recentFinals = useMemo(() => {
    return championRows.slice(0, 5);
  }, [championRows]);

  const scopeLabel =
    role === 'super_admin'
      ? 'Global reporting view'
      : `${university?.short_name || 'University'} reporting scope`;

  const refreshedLabel = refreshedAt ? `Updated ${format(new Date(refreshedAt), 'MMM d, hh:mm a')}` : 'Waiting for live sync';

  if (!canViewReports) {
    return (
      <DashboardLayout>
        <AccessDenied description="Reports are available for admins, super admins, and coordinators." />
      </DashboardLayout>
    );
  }

  if (role !== 'super_admin' && !universityId) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-900 p-8 text-white shadow-xl">
            <Badge className="mb-4 bg-white/10 text-white hover:bg-white/10">Setup required</Badge>
            <h1 className="text-3xl font-display font-bold">Reports need a university context</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-200">
              Your access is valid, but reports stay tenant-scoped unless the account is attached to a university.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-3xl" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[...Array(6)].map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            {[...Array(4)].map((_, index) => (
              <Skeleton key={index} className="h-[360px] rounded-2xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-900 p-6 text-white shadow-xl lg:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">
                  <FileText className="mr-1 h-3.5 w-3.5" />
                  {scopeLabel}
                </Badge>
                <Badge className="border-cyan-400/20 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/15">
                  <Activity className="mr-1 h-3.5 w-3.5" />
                  Realtime sync
                </Badge>
              </div>
              <div>
                <h1 className="text-3xl font-display font-bold lg:text-4xl">Competition Reports</h1>
                <p className="mt-2 text-sm text-slate-200 lg:text-base">
                  Review completed match outcomes, champions, standings, and bracket progression with tenant-safe data
                  access and live refreshes built in.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Data freshness</p>
                <p className="mt-2 text-lg font-semibold">{refreshedLabel}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Access model</p>
                <p className="mt-2 text-lg font-semibold">
                  {role === 'super_admin' ? 'Cross-tenant visibility' : 'University-only visibility'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-xl">Reports failed to load</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
              <div className="dashboard-card p-4">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Teams
                </p>
                <p className="mt-2 text-2xl font-display font-bold">{stats.totalTeams}</p>
              </div>
              <div className="dashboard-card p-4">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Participants
                </p>
                <p className="mt-2 text-2xl font-display font-bold">{stats.totalParticipants}</p>
              </div>
              <div className="dashboard-card p-4">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Target className="h-4 w-4" />
                  Completed Matches
                </p>
                <p className="mt-2 text-2xl font-display font-bold">{stats.completedMatches}</p>
              </div>
              <div className="dashboard-card p-4">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Trophy className="h-4 w-4" />
                  Champions
                </p>
                <p className="mt-2 text-2xl font-display font-bold">{stats.champions}</p>
              </div>
              <div className="dashboard-card p-4">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BarChart3 className="h-4 w-4" />
                  Active Groups
                </p>
                <p className="mt-2 text-2xl font-display font-bold">{stats.activeGroups}</p>
              </div>
              <div className="dashboard-card p-4">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Scope
                </p>
                <p className="mt-2 text-2xl font-display font-bold">{role === 'super_admin' ? 'Global' : 'Tenant'}</p>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Teams Per Event</CardTitle>
                  <CardDescription>Roster density by competition.</CardDescription>
                </CardHeader>
                <CardContent>
                  {eventTeamTotals.length ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={eventTeamTotals}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                          <XAxis dataKey="eventName" hide />
                          <YAxis allowDecimals={false} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Bar dataKey="teamCount" fill="#0891b2" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                      Event team totals will appear after teams are generated.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Recent Champions</CardTitle>
                  <CardDescription>Finals that already produced a winner.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recentFinals.length ? (
                    recentFinals.map((champion) => {
                      const winnerName =
                        champion.winner_team_id === champion.team_a_id
                          ? champion.team_a?.name
                          : champion.winner_team_id === champion.team_b_id
                            ? champion.team_b?.name
                            : 'TBD';

                      return (
                        <div
                          key={champion.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-muted/30 px-4 py-3"
                        >
                          <div>
                            <p className="font-medium">
                              {champion.event_sport?.sport_category?.icon} {champion.event_sport?.sport_category?.name}
                            </p>
                            <p className="text-sm text-muted-foreground">{champion.event_sport?.event?.name}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-semibold">{winnerName || 'TBD'}</p>
                              <p className="text-xs text-muted-foreground">Champion</p>
                            </div>
                            <StatusBadge status="completed" />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                      No finals have been completed yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Group Standings</CardTitle>
                <CardDescription>Live table positions from the current reporting scope.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {standingsByGroup.length ? (
                  standingsByGroup.map(([key, rows]) => (
                    <div key={key} className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{rows[0]?.event?.name}</Badge>
                        <Badge variant="outline">Group {rows[0]?.group_name}</Badge>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-border/80">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 text-left text-muted-foreground">
                            <tr>
                              <th className="px-4 py-3">Team</th>
                              <th className="px-4 py-3">University</th>
                              <th className="px-4 py-3">P</th>
                              <th className="px-4 py-3">W</th>
                              <th className="px-4 py-3">L</th>
                              <th className="px-4 py-3">D</th>
                              <th className="px-4 py-3">Pts</th>
                              <th className="px-4 py-3">GD</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, index) => (
                              <tr key={row.id} className="border-t border-border/60">
                                <td className="px-4 py-3 font-medium">
                                  {index + 1}. {row.team?.name || 'Unknown Team'}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {row.team?.university?.short_name || 'N/A'}
                                </td>
                                <td className="px-4 py-3">{row.played}</td>
                                <td className="px-4 py-3">{row.won}</td>
                                <td className="px-4 py-3">{row.lost}</td>
                                <td className="px-4 py-3">{row.draw}</td>
                                <td className="px-4 py-3 font-semibold">{row.points}</td>
                                <td className="px-4 py-3">{row.goal_difference}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                    Group standings will appear after results are recorded.
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedEventSportId && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Bracket Snapshot</CardTitle>
                  <CardDescription>Current tournament progression for the selected event sport.</CardDescription>
                </CardHeader>
                <CardContent>
                  <TournamentBracket eventSportId={selectedEventSportId} />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
