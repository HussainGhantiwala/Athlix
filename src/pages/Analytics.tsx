import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessDenied } from '@/components/auth/AccessDenied';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  BarChart3,
  Building2,
  Calendar,
  DollarSign,
  PieChart,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie as RechartsPie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const ANALYTICS_ALLOWED_ROLES = ['admin', 'super_admin', 'student_coordinator', 'coordinator'] as const;
const CHART_COLORS = ['#14b8a6', '#0f766e', '#22c55e', '#f59e0b', '#f97316', '#6366f1'];
const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '12px',
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08)',
};

type EventRow = {
  id: string;
  university_id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
};

type MatchTeamRef = {
  id: string;
  name: string | null;
} | null;

type MatchRow = {
  id: string;
  university_id: string | null;
  status: string;
  scheduled_at: string;
  created_at: string;
  winner_team_id: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  team_a: MatchTeamRef;
  team_b: MatchTeamRef;
};

type RegistrationRow = {
  id: string;
  university_id: string | null;
  status: string;
  created_at: string;
  event_sport?: {
    sport_category?: {
      name: string | null;
    } | null;
  } | null;
};

type BudgetRow = {
  id: string;
  status: string;
  estimated_amount: number | null;
  actual_amount: number | null;
  event?: {
    id: string;
    name: string;
    university_id: string | null;
  } | null;
};

type UniversityRow = {
  id: string;
  name: string;
  short_name: string;
};

type TeamRow = {
  id: string;
  university_id: string | null;
};

type AnalyticsSnapshot = {
  events: EventRow[];
  matches: MatchRow[];
  registrations: RegistrationRow[];
  teams: TeamRow[];
  budgets: BudgetRow[];
  universities: UniversityRow[];
  refreshedAt: string | null;
};

const EMPTY_SNAPSHOT: AnalyticsSnapshot = {
  events: [],
  matches: [],
  registrations: [],
  teams: [],
  budgets: [],
  universities: [],
  refreshedAt: null,
};

function normalizeMatchStatus(status: string | null | undefined) {
  if (!status) return 'Unknown';
  if (status === 'completed_provisional' || status === 'finalized') {
    return 'Completed';
  }

  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShortCount(value: number) {
  return new Intl.NumberFormat('en-IN', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function getTeamName(match: MatchRow, teamId: string | null) {
  if (!teamId) return null;
  if (match.team_a_id === teamId) return match.team_a?.name || 'Team A';
  if (match.team_b_id === teamId) return match.team_b?.name || 'Team B';
  return 'Unknown Team';
}

function formatRefreshedAt(timestamp: string | null) {
  if (!timestamp) return 'Waiting for live data';

  return `Updated ${format(new Date(timestamp), 'MMM d, hh:mm a')}`;
}

export default function Analytics() {
  const { role, universityId, university, isReady } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const canViewAnalytics =
    !!role && ANALYTICS_ALLOWED_ROLES.includes(role as (typeof ANALYTICS_ALLOWED_ROLES)[number]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsSnapshot | null>(null);

  const fetchAnalytics = useCallback(
    async (withLoader = true) => {
      if (!canViewAnalytics) {
        setAnalyticsData(EMPTY_SNAPSHOT);
        setLoading(false);
        return EMPTY_SNAPSHOT;
      }

      if (!isSuperAdmin && !universityId) {
        setAnalyticsData(EMPTY_SNAPSHOT);
        setLoading(false);
        return EMPTY_SNAPSHOT;
      }

      try {
        if (withLoader) {
          setLoading(true);
        }

        setError(null);

        let eventsQuery = supabase
          .from('events')
          .select('id, university_id, name, status, start_date, end_date');

        let matchesQuery = supabase
          .from('matches')
          .select(`
            id,
            university_id,
            status,
            scheduled_at,
            created_at,
            winner_team_id,
            team_a_id,
            team_b_id,
            team_a:teams!matches_team_a_id_fkey(id, name),
            team_b:teams!matches_team_b_id_fkey(id, name)
          `)
          .or('is_placeholder.is.null,is_placeholder.eq.false');

        let registrationsQuery = supabase
          .from('registrations')
          .select(`
            id,
            university_id,
            status,
            created_at,
            event_sport:event_sports(
              sport_category:sports_categories(name)
            )
          `);

        let teamsQuery = supabase
          .from('teams')
          .select('id, university_id');

        let budgetsQuery = supabase
          .from('budgets')
          .select(`
            id,
            status,
            estimated_amount,
            actual_amount,
            event:events!inner(id, name, university_id)
          `);

        if (!isSuperAdmin) {
          eventsQuery = eventsQuery.eq('university_id', universityId);
          matchesQuery = matchesQuery.eq('university_id', universityId);
          registrationsQuery = registrationsQuery.eq('university_id', universityId);
          teamsQuery = teamsQuery.eq('university_id', universityId);
          budgetsQuery = budgetsQuery.eq('event.university_id', universityId);
        }

        const universitiesQuery = isSuperAdmin
          ? supabase.from('universities').select('id, name, short_name').order('short_name')
          : Promise.resolve({ data: [], error: null });

        const [eventsRes, matchesRes, registrationsRes, teamsRes, budgetsRes, universitiesRes] = await Promise.all([
          eventsQuery,
          matchesQuery,
          registrationsQuery,
          teamsQuery,
          budgetsQuery,
          universitiesQuery,
        ]);

        const queryError =
          eventsRes.error ||
          matchesRes.error ||
          registrationsRes.error ||
          teamsRes.error ||
          budgetsRes.error ||
          universitiesRes.error;

        if (queryError) {
          throw queryError;
        }

        const nextAnalyticsData: AnalyticsSnapshot = {
          events: (eventsRes.data as EventRow[] | null) ?? [],
          matches: (matchesRes.data as MatchRow[] | null) ?? [],
          registrations: (registrationsRes.data as RegistrationRow[] | null) ?? [],
          teams: (teamsRes.data as TeamRow[] | null) ?? [],
          budgets: (budgetsRes.data as BudgetRow[] | null) ?? [],
          universities: (universitiesRes.data as UniversityRow[] | null) ?? [],
          refreshedAt: new Date().toISOString(),
        };

        setAnalyticsData(nextAnalyticsData);
        return nextAnalyticsData;
      } catch (err) {
        console.error('Analytics Error:', err);
        setError('Failed to load analytics');
        setAnalyticsData((currentData) => currentData ?? EMPTY_SNAPSHOT);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [canViewAnalytics, isSuperAdmin, universityId],
  );

  useEffect(() => {
    console.log({
      role,
      universityId,
      isSuperAdmin,
    });
  }, [isSuperAdmin, role, universityId]);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        await fetchAnalytics(true);
      } catch (err) {
        console.error('Analytics Error:', err);
        setError('Failed to load analytics');
      }
    };

    void loadAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    if (!canViewAnalytics) {
      return;
    }

    const channel = supabase
      .channel(`analytics-live-${role ?? 'unknown'}-${universityId ?? 'global'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        void (async () => {
          try {
            await fetchAnalytics(false);
          } catch (err) {
            console.error('Analytics Error:', err);
            setError('Failed to load analytics');
          }
        })();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        void (async () => {
          try {
            await fetchAnalytics(false);
          } catch (err) {
            console.error('Analytics Error:', err);
            setError('Failed to load analytics');
          }
        })();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        void (async () => {
          try {
            await fetchAnalytics(false);
          } catch (err) {
            console.error('Analytics Error:', err);
            setError('Failed to load analytics');
          }
        })();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        void (async () => {
          try {
            await fetchAnalytics(false);
          } catch (err) {
            console.error('Analytics Error:', err);
            setError('Failed to load analytics');
          }
        })();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, () => {
        void (async () => {
          try {
            await fetchAnalytics(false);
          } catch (err) {
            console.error('Analytics Error:', err);
            setError('Failed to load analytics');
          }
        })();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canViewAnalytics, fetchAnalytics, role, universityId]);

  const snapshot = analyticsData ?? EMPTY_SNAPSHOT;

  const stats = useMemo(() => {
    const liveMatches = snapshot.matches.filter((match) => match.status === 'live').length;
    const completedMatches = snapshot.matches.filter((match) =>
      ['completed', 'completed_provisional', 'finalized'].includes(match.status),
    ).length;
    const totalBudget = snapshot.budgets.reduce((sum, budget) => sum + (budget.estimated_amount || 0), 0);
    const approvedBudget = snapshot.budgets
      .filter((budget) => budget.status === 'approved')
      .reduce((sum, budget) => sum + (budget.estimated_amount || 0), 0);
    const totalUniversities = new Set(
      snapshot.matches.map((match) => match.university_id).filter(Boolean),
    ).size;

    return {
      totalEvents: snapshot.events.length,
      totalParticipants: snapshot.registrations.length,
      totalMatches: snapshot.matches.length,
      totalTeams: snapshot.teams.length,
      liveMatches,
      completedMatches,
      totalBudget,
      approvedBudget,
      totalUniversities,
      completionRate: snapshot.matches.length ? (completedMatches / snapshot.matches.length) * 100 : 0,
      budgetApprovalRate: totalBudget ? (approvedBudget / totalBudget) * 100 : 0,
    };
  }, [snapshot]);

  const matchesOverTime = useMemo(() => {
    const buckets = new Map<string, number>();

    snapshot.matches.forEach((match) => {
      const dateKey = format(new Date(match.scheduled_at || match.created_at), 'yyyy-MM-dd');
      buckets.set(dateKey, (buckets.get(dateKey) || 0) + 1);
    });

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({
        date,
        label: format(new Date(date), 'MMM d'),
        count,
      }));
  }, [snapshot.matches]);

  const sportParticipation = useMemo(() => {
    const buckets = new Map<string, number>();

    snapshot.registrations.forEach((registration) => {
      const sportName = registration.event_sport?.sport_category?.name || 'Unknown';
      buckets.set(sportName, (buckets.get(sportName) || 0) + 1);
    });

    return Array.from(buckets.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [snapshot.registrations]);

  const matchesByStatus = useMemo(() => {
    const buckets = new Map<string, number>();

    snapshot.matches.forEach((match) => {
      const label = normalizeMatchStatus(match.status);
      buckets.set(label, (buckets.get(label) || 0) + 1);
    });

    return Array.from(buckets.entries()).map(([name, count]) => ({ name, count }));
  }, [snapshot.matches]);

  const topTeams = useMemo(() => {
    const buckets = new Map<string, { name: string; wins: number }>();

    snapshot.matches.forEach((match) => {
      if (!match.winner_team_id) {
        return;
      }

      const teamName = getTeamName(match, match.winner_team_id);
      if (!teamName) {
        return;
      }

      const existing = buckets.get(match.winner_team_id);
      if (existing) {
        existing.wins += 1;
      } else {
        buckets.set(match.winner_team_id, {
          name: teamName,
          wins: 1,
        });
      }
    });

    return Array.from(buckets.values())
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 5);
  }, [snapshot.matches]);

  const universityComparison = useMemo(() => {
    if (role !== 'super_admin') {
      return [];
    }

    const universityMap = new Map<
      string,
      { id: string; shortName: string; name: string; matches: number; participants: number }
    >();

    snapshot.universities.forEach((universityRow) => {
      universityMap.set(universityRow.id, {
        id: universityRow.id,
        shortName: universityRow.short_name,
        name: universityRow.name,
        matches: 0,
        participants: 0,
      });
    });

    snapshot.matches.forEach((match) => {
      if (!match.university_id) {
        return;
      }

      const universityEntry =
        universityMap.get(match.university_id) ||
        {
          id: match.university_id,
          shortName: 'Unknown',
          name: 'Unknown University',
          matches: 0,
          participants: 0,
        };

      universityEntry.matches += 1;
      universityMap.set(match.university_id, universityEntry);
    });

    snapshot.registrations.forEach((registration) => {
      if (!registration.university_id) {
        return;
      }

      const universityEntry =
        universityMap.get(registration.university_id) ||
        {
          id: registration.university_id,
          shortName: 'Unknown',
          name: 'Unknown University',
          matches: 0,
          participants: 0,
        };

      universityEntry.participants += 1;
      universityMap.set(registration.university_id, universityEntry);
    });

    return Array.from(universityMap.values())
      .sort((a, b) => b.matches - a.matches || b.participants - a.participants)
      .slice(0, 8);
  }, [role, snapshot.matches, snapshot.registrations, snapshot.universities]);

  const insightCards = useMemo(() => {
    const topSport = sportParticipation[0];
    const topTeam = topTeams[0];

    return [
      {
        title: 'Match completion',
        value: `${stats.completionRate.toFixed(0)}%`,
        description: `${stats.completedMatches} of ${stats.totalMatches} matches are wrapped up.`,
      },
      {
        title: 'Budget approved',
        value: `${stats.budgetApprovalRate.toFixed(0)}%`,
        description: `${formatCurrency(stats.approvedBudget)} cleared out of ${formatCurrency(stats.totalBudget)} planned.`,
      },
      {
        title: 'Most active sport',
        value: topSport?.name || 'No data yet',
        description: topSport ? `${topSport.value} registrations lead the board.` : 'Registrations will surface once activity starts.',
      },
      {
        title: 'Top team',
        value: topTeam?.name || 'No winner yet',
        description: topTeam ? `${topTeam.wins} wins recorded so far.` : 'Completed matches will populate this leaderboard.',
      },
    ];
  }, [sportParticipation, stats, topTeams]);

  const scopeLabel =
    isSuperAdmin
      ? 'Global analytics across all universities'
      : `${university?.short_name || 'University'} tenant scope`;

  if (!isReady) {
    return <div>Loading analytics...</div>;
  }

  if (!canViewAnalytics) {
    return (
      <DashboardLayout>
        <AccessDenied description="Analytics are available for admins, super admins, and coordinators." />
      </DashboardLayout>
    );
  }

  if (!universityId && !isSuperAdmin) {
    return (
      <DashboardLayout>
        <div>No university assigned</div>
      </DashboardLayout>
    );
  }

  if (!analyticsData && !loading) {
    return (
      <DashboardLayout>
        <div>
          <h1>Analytics Dashboard</h1>
          {error && <p>{error}</p>}
          <p>No analytics data available</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 p-6 text-white shadow-xl lg:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                  {role === 'super_admin' ? 'Global mode' : 'Tenant scoped'}
                </Badge>
                <Badge className="border-emerald-400/20 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/15">
                  <Activity className="mr-1 h-3.5 w-3.5" />
                  Live updates on
                </Badge>
              </div>
              <div>
                <h1 className="text-3xl font-display font-bold lg:text-4xl">Analytics Command Center</h1>
                <p className="mt-2 text-sm text-slate-200 lg:text-base">
                  Track match growth, participation, budget health, and university performance without losing the tenant
                  boundaries your RLS rules expect.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Scope</p>
                <p className="mt-2 text-lg font-semibold">{scopeLabel}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Freshness</p>
                <p className="mt-2 text-lg font-semibold">{formatRefreshedAt(snapshot.refreshedAt)}</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[...Array(8)].map((_, index) => (
                <Skeleton key={index} className="h-32 rounded-xl" />
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              {[...Array(4)].map((_, index) => (
                <Skeleton key={index} className="h-[360px] rounded-2xl" />
              ))}
            </div>
          </>
        ) : error ? (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-xl">Analytics failed to load</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatsCard title="Events" value={stats.totalEvents} icon={Calendar} description="Across the current scope" />
              <StatsCard
                title="Participants"
                value={stats.totalParticipants}
                icon={Users}
                description={`${formatShortCount(stats.totalParticipants)} registrations processed`}
              />
              <StatsCard
                title="Matches"
                value={stats.totalMatches}
                icon={Target}
                description={`${stats.liveMatches} live right now`}
              />
              <StatsCard
                title="Completed"
                value={stats.completedMatches}
                icon={Trophy}
                description={`${stats.completionRate.toFixed(0)}% completion rate`}
              />
              <StatsCard
                title="Total Budget"
                value={formatCurrency(stats.totalBudget)}
                icon={DollarSign}
                description="Planned spend"
              />
              <StatsCard
                title="Approved Budget"
                value={formatCurrency(stats.approvedBudget)}
                icon={TrendingUp}
                description={`${stats.budgetApprovalRate.toFixed(0)}% approved`}
              />
              <StatsCard
                title="Most Active Sport"
                value={sportParticipation[0]?.name || 'Pending'}
                icon={PieChart}
                description={sportParticipation[0] ? `${sportParticipation[0].value} signups` : 'Waiting for registrations'}
              />
              <StatsCard
                title={role === 'super_admin' ? 'Active Universities' : 'Scope Health'}
                value={role === 'super_admin' ? stats.totalUniversities : stats.totalTeams}
                icon={role === 'super_admin' ? Building2 : ShieldCheck}
                description={role === 'super_admin' ? 'Universities represented in global match data' : 'Teams in your university scope'}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-xl">Matches Over Time</CardTitle>
                  <CardDescription>Growth trend for scheduled match volume.</CardDescription>
                </CardHeader>
                <CardContent>
                  {matchesOverTime.length ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={matchesOverTime}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                          <XAxis dataKey="label" />
                          <YAxis allowDecimals={false} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Line
                            type="monotone"
                            dataKey="count"
                            stroke="#14b8a6"
                            strokeWidth={3}
                            dot={{ r: 4, fill: '#14b8a6' }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                      Match activity will appear here once fixtures are scheduled.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-xl">Match Status Distribution</CardTitle>
                  <CardDescription>Live, scheduled, completed, and exception states at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  {matchesByStatus.length ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={matchesByStatus}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                          <XAxis dataKey="name" />
                          <YAxis allowDecimals={false} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Bar dataKey="count" fill="#0f766e" radius={[10, 10, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                      Match statuses will populate as soon as matches exist in this scope.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-xl">Sport Participation</CardTitle>
                  <CardDescription>Where athlete demand is clustering right now.</CardDescription>
                </CardHeader>
                <CardContent>
                  {sportParticipation.length ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={sportParticipation}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={70}
                            outerRadius={110}
                            paddingAngle={4}
                            isAnimationActive
                          >
                            {sportParticipation.map((entry, index) => (
                              <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Legend />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                      Registration data will drive this chart once athletes start signing up.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Top Teams</CardTitle>
                  <CardDescription>Leaderboard ranked by wins from completed results.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {topTeams.length ? (
                    topTeams.map((team, index) => (
                      <div
                        key={team.name}
                        className="flex items-center justify-between rounded-2xl border border-border/80 bg-muted/30 px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 font-semibold text-accent">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium">{team.name}</p>
                            <p className="text-sm text-muted-foreground">Win conversion leader</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-display font-bold">{team.wins}</p>
                          <p className="text-sm text-muted-foreground">wins</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                      Winners will appear here after matches are completed.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              {role === 'super_admin' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">University Comparison</CardTitle>
                    <CardDescription>Matches and participants by university for the global view.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {universityComparison.length ? (
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={universityComparison}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                            <XAxis dataKey="shortName" />
                            <YAxis allowDecimals={false} />
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            <Legend />
                            <Bar dataKey="matches" fill="#14b8a6" radius={[8, 8, 0, 0]} />
                            <Bar dataKey="participants" fill="#6366f1" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                        University comparison becomes available when multiple universities have activity.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className={role === 'super_admin' ? '' : 'xl:col-span-2'}>
                <CardHeader>
                  <CardTitle className="text-xl">Quick Insights</CardTitle>
                  <CardDescription>Auto-generated signals from the current analytics snapshot.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  {insightCards.map((insight) => (
                    <div
                      key={insight.title}
                      className="rounded-2xl border border-border/80 bg-gradient-to-br from-background to-muted/40 p-4"
                    >
                      <p className="text-sm font-medium text-muted-foreground">{insight.title}</p>
                      <p className="mt-3 text-2xl font-display font-bold">{insight.value}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{insight.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
