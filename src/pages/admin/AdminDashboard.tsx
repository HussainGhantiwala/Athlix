import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Calendar,
  Users,
  Target,
  DollarSign,
  BarChart3,
  FileText,
  Trophy,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';

interface DashboardStats {
  totalUniversities: number;
  totalEvents: number;
  activeEvents: number;
  pendingEvents: number;
  totalTeams: number;
  liveMatches: number;
  pendingBudgets: number;
  totalParticipants: number;
}

interface PendingItem {
  id: string;
  type: 'event' | 'budget' | 'team';
  title: string;
  subtitle: string;
  created_at: string;
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalUniversities: 0,
    totalEvents: 0,
    activeEvents: 0,
    pendingEvents: 0,
    totalTeams: 0,
    liveMatches: 0,
    pendingBudgets: 0,
    totalParticipants: 0,
  });
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();

    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchStats())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchPendingItems(), fetchRecentActivity()]);
    setLoading(false);
  };

  const fetchStats = async () => {
    const [
      universitiesRes,
      eventsRes,
      teamsRes,
      matchesRes,
      budgetsRes,
      registrationsRes,
    ] = await Promise.all([
      supabase.from('universities').select('id', { count: 'exact' }),
      supabase.from('events').select('id, status', { count: 'exact' }),
      supabase.from('teams').select('id', { count: 'exact' }),
      supabase.from('matches').select('id, status', { count: 'exact' }),
      supabase.from('budgets').select('id, status', { count: 'exact' }),
      supabase
        .from('registration_submissions')
        .select('id', { count: 'exact' }),
    ]);

    const activeEvents = eventsRes.data?.filter(e => e.status === 'active').length || 0;
    const pendingEvents = eventsRes.data?.filter(e => e.status === 'pending_approval').length || 0;
    const liveMatches = matchesRes.data?.filter(m => m.status === 'live').length || 0;
    const pendingBudgets = budgetsRes.data?.filter(b => b.status === 'submitted').length || 0;

    setStats({
      totalUniversities: universitiesRes.count || 0,
      totalEvents: eventsRes.count || 0,
      activeEvents,
      pendingEvents,
      totalTeams: teamsRes.count || 0,
      liveMatches,
      pendingBudgets,
      totalParticipants: registrationsRes.count || 0,
    });
  };

  const fetchPendingItems = async () => {
    const items: PendingItem[] = [];

    // Pending events
    const { data: pendingEvents } = await supabase
      .from('events')
      .select('id, name, created_at, university:universities(short_name)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })
      .limit(5);

    pendingEvents?.forEach(e => {
      items.push({
        id: e.id,
        type: 'event',
        title: e.name,
        subtitle: (e.university as any)?.short_name || 'Unknown University',
        created_at: e.created_at,
      });
    });

    // Pending budgets
    const { data: pendingBudgets } = await supabase
      .from('budgets')
      .select('id, title, created_at, event:events(name)')
      .eq('status', 'submitted')
      .order('created_at', { ascending: false })
      .limit(5);

    pendingBudgets?.forEach(b => {
      items.push({
        id: b.id,
        type: 'budget',
        title: b.title,
        subtitle: (b.event as any)?.name || 'Unknown Event',
        created_at: b.created_at,
      });
    });

    // Pending teams
    const { data: pendingTeams } = await supabase
      .from('teams')
      .select('id, name, created_at, university:universities(short_name)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })
      .limit(5);

    pendingTeams?.forEach(t => {
      items.push({
        id: t.id,
        type: 'team',
        title: t.name,
        subtitle: (t.university as any)?.short_name || 'Unknown University',
        created_at: t.created_at,
      });
    });

    // Sort by date
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setPendingItems(items.slice(0, 8));
  };

  const fetchRecentActivity = async () => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    setRecentActivity(data || []);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Welcome Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl lg:text-3xl font-display font-bold">
              {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'Admin'}! 👋
            </h1>
            <p className="text-muted-foreground">
              Sports Director Dashboard — Full administrative access
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/reports">
                <FileText className="mr-2 h-4 w-4" />
                Generate Reports
              </Link>
            </Button>
            <Button asChild>
              <Link to="/admin/events/new">
                <Calendar className="mr-2 h-4 w-4" />
                Create Event
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            [...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))
          ) : (
            <>
              <StatsCard
                title="Universities"
                value={stats.totalUniversities}
                icon={Building2}
                description="Registered institutions"
              />
              <StatsCard
                title="Total Events"
                value={stats.totalEvents}
                icon={Calendar}
                trend={{ value: 8, label: 'vs last month' }}
              />
              <StatsCard
                title="Active Events"
                value={stats.activeEvents}
                icon={TrendingUp}
                description="Currently running"
              />
              <StatsCard
                title="Live Matches"
                value={stats.liveMatches}
                icon={Target}
                description="Happening now"
              />
              <StatsCard
                title="Total Teams"
                value={stats.totalTeams}
                icon={Users}
              />
              <StatsCard
                title="Participants"
                value={stats.totalParticipants}
                icon={Trophy}
                description="Registered athletes"
              />
              <StatsCard
                title="Pending Events"
                value={stats.pendingEvents}
                icon={Clock}
                description="Awaiting approval"
              />
              <StatsCard
                title="Pending Budgets"
                value={stats.pendingBudgets}
                icon={DollarSign}
                description="Awaiting review"
              />
            </>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Pending Approvals */}
          <div className="dashboard-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-status-provisional" />
                Pending Approvals
              </h2>
              <span className="text-sm text-muted-foreground">
                {pendingItems.length} items
              </span>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : pendingItems.length > 0 ? (
              <div className="space-y-3">
                {pendingItems.map(item => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        item.type === 'event' ? 'bg-primary/10' :
                        item.type === 'budget' ? 'bg-status-provisional/10' :
                        'bg-accent/10'
                      }`}>
                        {item.type === 'event' && <Calendar className="h-4 w-4 text-primary" />}
                        {item.type === 'budget' && <DollarSign className="h-4 w-4 text-status-provisional" />}
                        {item.type === 'team' && <Users className="h-4 w-4 text-accent" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.created_at), 'MMM d')}
                      </span>
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/admin/${item.type}s/${item.id}`}>
                          Review
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-status-finalized mx-auto mb-3" />
                <p className="text-muted-foreground">All caught up!</p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="dashboard-card p-6">
            <h2 className="text-lg font-display font-bold mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/admin/universities"
                className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Universities</p>
                  <p className="text-xs text-muted-foreground">Manage institutions</p>
                </div>
              </Link>
              <Link
                to="/admin/events"
                className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-sm">Events</p>
                  <p className="text-xs text-muted-foreground">Create & manage</p>
                </div>
              </Link>
              <Link
                to="/admin/coordinators"
                className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-status-live/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-status-live" />
                </div>
                <div>
                  <p className="font-medium text-sm">Coordinators</p>
                  <p className="text-xs text-muted-foreground">Assign roles</p>
                </div>
              </Link>
              <Link
                to="/admin/budgets"
                className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-status-provisional/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-status-provisional" />
                </div>
                <div>
                  <p className="font-medium text-sm">Budgets</p>
                  <p className="text-xs text-muted-foreground">Review & approve</p>
                </div>
              </Link>
              <Link
                to="/admin/matches"
                className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-status-finalized/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-status-finalized" />
                </div>
                <div>
                  <p className="font-medium text-sm">Matches</p>
                  <p className="text-xs text-muted-foreground">View all matches</p>
                </div>
              </Link>
              <Link
                to="/admin/analytics"
                className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Analytics</p>
                  <p className="text-xs text-muted-foreground">View statistics</p>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="dashboard-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-bold">Recent Activity</h2>
            <Link to="/admin/audit-logs" className="text-sm text-accent hover:underline">
              View all →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : recentActivity.length > 0 ? (
            <div className="space-y-2">
              {recentActivity.slice(0, 6).map(log => (
                <div
                  key={log.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      log.action === 'finalize' ? 'bg-status-finalized' :
                      log.action === 'approve' ? 'bg-status-live' :
                      log.action === 'update' ? 'bg-status-provisional' :
                      'bg-muted-foreground'
                    }`} />
                    <div>
                      <p className="text-sm">
                        <span className="capitalize font-medium">{log.action}</span> on{' '}
                        <span className="text-muted-foreground">{log.table_name}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), 'MMM d, HH:mm')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No recent activity</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
