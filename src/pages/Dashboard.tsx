import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { LiveMatchCard } from '@/components/dashboard/LiveMatchCard';
import { UpcomingEventCard } from '@/components/dashboard/UpcomingEventCard';
import { Match, Event } from '@/types/database';
import { Calendar, Users, Target, Trophy, TrendingUp, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const { profile, role, isAdmin, isFaculty } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEvents: 0,
    activeEvents: 0,
    totalTeams: 0,
    liveMatches: 0,
  });
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);

  useEffect(() => {
    fetchDashboardData();
    
    // Subscribe to live match updates
    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        fetchLiveMatches();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        fetchLiveMatches();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchLiveMatches(), fetchUpcomingEvents()]);
    setLoading(false);
  };

  const fetchStats = async () => {
    const [eventsRes, teamsRes, matchesRes] = await Promise.all([
      supabase.from('events').select('id, status', { count: 'exact' }),
      supabase.from('teams').select('id', { count: 'exact' }),
      supabase.from('matches').select('id, status', { count: 'exact' }),
    ]);

    const activeEvents = eventsRes.data?.filter((e) => e.status === 'active').length || 0;
    const liveMatchCount = matchesRes.data?.filter((m) => m.status === 'live').length || 0;

    setStats({
      totalEvents: eventsRes.count || 0,
      activeEvents,
      totalTeams: teamsRes.count || 0,
      liveMatches: liveMatchCount,
    });
  };

  const fetchLiveMatches = async () => {
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        venue:venues(name),
        event_sport:event_sports(sport_category:sports_categories(name, icon)),
        scores(*)
      `)
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(6);

    setLiveMatches((data as unknown as Match[]) || []);
  };

  const fetchUpcomingEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select(`*, university:universities(short_name)`)
      .in('status', ['approved', 'active'])
      .gte('end_date', new Date().toISOString().split('T')[0])
      .order('start_date')
      .limit(4);

    setUpcomingEvents((data as unknown as Event[]) || []);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getRoleWelcome = () => {
    switch (role) {
      case 'admin':
        return 'You have full administrative access to all features.';
      case 'faculty':
        return 'Manage events, matches, and coordinate sports activities.';
      case 'student_coordinator':
        return 'Assist with registrations, teams, and live score updates.';
      default:
        return 'Register for events and track your favorite sports.';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Welcome Section */}
        <div className="space-y-1">
          <h1 className="text-2xl lg:text-3xl font-display font-bold">
            {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'there'}! 👋
          </h1>
          <p className="text-muted-foreground">{getRoleWelcome()}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            <>
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </>
          ) : (
            <>
              <StatsCard
                title="Total Events"
                value={stats.totalEvents}
                icon={Calendar}
                trend={{ value: 12, label: 'vs last month' }}
              />
              <StatsCard
                title="Active Events"
                value={stats.activeEvents}
                icon={TrendingUp}
                description="Currently running"
              />
              <StatsCard
                title="Total Teams"
                value={stats.totalTeams}
                icon={Users}
              />
              <StatsCard
                title="Live Matches"
                value={stats.liveMatches}
                icon={Target}
                description="Happening now"
              />
            </>
          )}
        </div>

        {/* Live Matches */}
        {liveMatches.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-status-live rounded-full animate-pulse" />
              <h2 className="text-xl font-display font-bold">Live Matches</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveMatches.map((match) => (
                <LiveMatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Events */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold">Upcoming Events</h2>
            <a href="/events" className="text-sm text-accent hover:underline">
              View all →
            </a>
          </div>
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : upcomingEvents.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {upcomingEvents.map((event) => (
                <UpcomingEventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="dashboard-card p-8 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No upcoming events</h3>
              <p className="text-sm text-muted-foreground">
                {isAdmin || isFaculty
                  ? 'Create a new event to get started'
                  : 'Check back later for new events'}
              </p>
            </div>
          )}
        </div>

        {/* Quick Actions (Admin/Faculty only) */}
        {(isAdmin || isFaculty) && (
          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold">Quick Actions</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <a
                href="/events/new"
                className="dashboard-card p-4 flex items-center gap-3 hover:border-accent transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium">Create Event</p>
                  <p className="text-sm text-muted-foreground">Set up a new sports event</p>
                </div>
              </a>
              <a
                href="/matches"
                className="dashboard-card p-4 flex items-center gap-3 hover:border-accent transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium">Manage Matches</p>
                  <p className="text-sm text-muted-foreground">Schedule and update scores</p>
                </div>
              </a>
              <a
                href="/teams"
                className="dashboard-card p-4 flex items-center gap-3 hover:border-accent transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium">Review Teams</p>
                  <p className="text-sm text-muted-foreground">Approve team formations</p>
                </div>
              </a>
              <a
                href="/registrations"
                className="dashboard-card p-4 flex items-center gap-3 hover:border-accent transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium">Registrations</p>
                  <p className="text-sm text-muted-foreground">Process player registrations</p>
                </div>
              </a>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
