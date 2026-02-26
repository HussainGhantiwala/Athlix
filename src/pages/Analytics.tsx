import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Calendar, 
  Users, 
  Target, 
  Trophy, 
  DollarSign, 
  BarChart3,
  PieChart
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Analytics() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEvents: 0,
    totalParticipants: 0,
    totalTeams: 0,
    totalMatches: 0,
    completedMatches: 0,
    totalBudget: 0,
  });
  const [sportParticipation, setSportParticipation] = useState<{ name: string; value: number }[]>([]);
  const [matchesByStatus, setMatchesByStatus] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    if (isAdmin) {
      fetchAnalytics();
    }
  }, [isAdmin]);

  const fetchAnalytics = async () => {
    setLoading(true);

    // Fetch counts
    const [eventsRes, registrationsRes, matchesRes, budgetsRes, sportsRes] = await Promise.all([
      supabase.from('events').select('id, status', { count: 'exact' }),
      supabase
        .from('registration_submissions')
        .select('id, sport_id, team_name', { count: 'exact' }),
      supabase.from('matches').select('id, status', { count: 'exact' }),
      supabase.from('budgets').select('id, status, estimated_amount'),
      supabase
        .from('sports_categories')
        .select('id, name')
    ]);

    const completedMatches =
      matchesRes.data?.filter((m) => ['completed', 'finalized', 'completed_provisional'].includes(m.status)).length || 0;
    const totalBudget = budgetsRes.data?.reduce((sum, b) => sum + (b.estimated_amount || 0), 0) || 0;
    const distinctTeamNames = new Set<string>();
    registrationsRes.data?.forEach((submission) => {
      const teamName = submission.team_name?.trim();
      if (teamName) distinctTeamNames.add(teamName);
    });

    setStats({
      totalEvents: eventsRes.count || 0,
      totalParticipants: registrationsRes.count || 0,
      totalTeams: distinctTeamNames.size,
      totalMatches: matchesRes.count || 0,
      completedMatches,
      totalBudget,
    });

    // Sport participation breakdown
    const sportsMap = new Map((sportsRes.data || []).map((sport) => [sport.id, sport.name]));
    const sportCounts: Record<string, number> = {};
    registrationsRes.data?.forEach((submission) => {
      const sportName = sportsMap.get(submission.sport_id);
      if (sportName) {
        sportCounts[sportName] = (sportCounts[sportName] || 0) + 1;
      }
    });
    setSportParticipation(
      Object.entries(sportCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
    );

    // Matches by status
    const statusCounts: Record<string, number> = {};
    matchesRes.data?.forEach((match) => {
      statusCounts[match.status] = (statusCounts[match.status] || 0) + 1;
    });
    setMatchesByStatus(
      Object.entries(statusCounts).map(([name, count]) => ({
        name: name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        count,
      }))
    );

    setLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators can view analytics.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Analytics</h1>
          <p className="text-muted-foreground">Platform performance and insights</p>
        </div>

        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatsCard
              title="Total Events"
              value={stats.totalEvents}
              icon={Calendar}
            />
            <StatsCard
              title="Total Participants"
              value={stats.totalParticipants}
              icon={Users}
            />
            <StatsCard
              title="Total Teams"
              value={stats.totalTeams}
              icon={Users}
            />
            <StatsCard
              title="Total Matches"
              value={stats.totalMatches}
              icon={Target}
            />
            <StatsCard
              title="Completed Matches"
              value={stats.completedMatches}
              icon={Trophy}
              description={`${((stats.completedMatches / stats.totalMatches) * 100 || 0).toFixed(0)}% completion rate`}
            />
            <StatsCard
              title="Total Budget"
              value={formatCurrency(stats.totalBudget)}
              icon={DollarSign}
            />
          </div>
        )}

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Sport Participation */}
          <div className="dashboard-card p-6">
            <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <PieChart className="h-5 w-5 text-accent" />
              Participation by Sport
            </h3>
            {loading ? (
              <Skeleton className="h-64" />
            ) : sportParticipation.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={sportParticipation}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {sportParticipation.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No participation data available
              </div>
            )}
          </div>

          {/* Matches by Status */}
          <div className="dashboard-card p-6">
            <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-accent" />
              Matches by Status
            </h3>
            {loading ? (
              <Skeleton className="h-64" />
            ) : matchesByStatus.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={matchesByStatus}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No match data available
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
