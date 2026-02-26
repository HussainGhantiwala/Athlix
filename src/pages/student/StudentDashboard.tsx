import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { LiveMatchCard } from '@/components/dashboard/LiveMatchCard';
import { UpcomingEventCard } from '@/components/dashboard/UpcomingEventCard';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Match, Event } from '@/types/database';
import {
  Calendar,
  Users,
  Target,
  Trophy,
  ClipboardCheck,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { UpcomingEventsSection } from '@/components/student/UpcomingEventsSection';

interface StudentStats {
  myRegistrations: number;
  myTeams: number;
  upcomingEvents: number;
  liveMatches: number;
}

interface StudentRegistrationRow {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  team_name: string | null;
  event?: { name: string } | null;
  sport?: { name: string; icon: string | null } | null;
}

export default function StudentDashboard() {
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StudentStats>({
    myRegistrations: 0,
    myTeams: 0,
    upcomingEvents: 0,
    liveMatches: 0,
  });
  const [myRegistrations, setMyRegistrations] = useState<StudentRegistrationRow[]>([]);
  const [myTeams, setMyTeams] = useState<string[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (user?.id) {
      fetchDashboardData();
      
      // Subscribe to live updates
      const channel = supabase
        .channel('student-updates')
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
    }
  }, [user?.id]);

  const fetchDashboardData = async () => {
    setLoading(true);
    await Promise.all([
      fetchStats(),
      fetchMyRegistrations(),
      fetchMyTeams(),
      fetchLiveMatches(),
      fetchUpcomingEvents(),
    ]);
    setLoading(false);
  };

  const fetchStats = async () => {
    const [registrationsRes, teamNamesRes, eventsRes, matchesRes] = await Promise.all([
      supabase
        .from('registration_submissions')
        .select('id', { count: 'exact' })
        .eq('user_id', user?.id || ''),
      supabase
        .from('registration_submissions')
        .select('team_name')
        .eq('user_id', user?.id || '')
        .not('team_name', 'is', null),
      supabase.from('events').select('id', { count: 'exact' }).in('status', ['approved', 'active']),
      supabase.from('matches').select('id', { count: 'exact' }).eq('status', 'live'),
    ]);

    const distinctTeamNames = new Set<string>();
    (teamNamesRes.data || []).forEach((row) => {
      const name = row.team_name?.trim();
      if (name) distinctTeamNames.add(name);
    });

    setStats({
      myRegistrations: registrationsRes.count || 0,
      myTeams: distinctTeamNames.size,
      upcomingEvents: eventsRes.count || 0,
      liveMatches: matchesRes.count || 0,
    });
  };

  const fetchMyRegistrations = async () => {
    const { data } = await supabase
      .from('registration_submissions')
      .select(`
        *,
        event:events(name),
        sport:sports_categories(name, icon)
      `)
      .eq('user_id', user?.id || '')
      .order('created_at', { ascending: false })
      .limit(5);

    setMyRegistrations((data as unknown as StudentRegistrationRow[]) || []);
  };

  const fetchMyTeams = async () => {
    const { data } = await supabase
      .from('registration_submissions')
      .select('team_name')
      .eq('user_id', user?.id || '')
      .not('team_name', 'is', null);

    const names = new Set<string>();
    (data || []).forEach((row) => {
      const teamName = row.team_name?.trim();
      if (teamName) {
        names.add(teamName);
      }
    });
    setMyTeams(Array.from(names.values()));
  };

  const fetchLiveMatches = async () => {
    const { data } = await supabase
      .from('matches')
      .select('*')
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Welcome Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl lg:text-3xl font-display font-bold">
              {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'there'}! 👋
            </h1>
            <p className="text-muted-foreground">
              Track your sports, teams, and live matches
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/student/open-registrations">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Open Registrations
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/student/events">
                <Calendar className="mr-2 h-4 w-4" />
                Browse Events
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))
          ) : (
            <>
              <StatsCard
                title="My Registrations"
                value={stats.myRegistrations}
                icon={ClipboardCheck}
              />
              <StatsCard
                title="My Teams"
                value={stats.myTeams}
                icon={Users}
              />
              <StatsCard
                title="Upcoming Events"
                value={stats.upcomingEvents}
                icon={Calendar}
              />
              <StatsCard
                title="Live Matches"
                value={stats.liveMatches}
                icon={Target}
                description="Watch now"
              />
            </>
          )}
        </div>

        {/* Live Matches */}
        {liveMatches.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-status-live rounded-full animate-pulse" />
                <h2 className="text-xl font-display font-bold">Live Matches</h2>
              </div>
              <Link to="/student/matches?status=live" className="text-sm text-accent hover:underline">
                View all →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveMatches.map((match) => (
                <LiveMatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* My Registrations */}
          <div className="dashboard-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-accent" />
                My Registrations
              </h2>
              <Link to="/student/registrations" className="text-sm text-accent hover:underline">
                View all →
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : myRegistrations.length > 0 ? (
              <div className="space-y-3">
                {myRegistrations.map(reg => (
                  <div
                    key={reg.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{reg.sport?.icon}</span>
                      <div>
                        <p className="font-medium text-sm">{reg.sport?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {reg.event?.name}
                          {reg.team_name ? ` • ${reg.team_name}` : ''}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={reg.status} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">No registrations yet</p>
                <Button asChild>
                  <Link to="/student/events">Browse Events</Link>
                </Button>
              </div>
            )}
          </div>

          {/* My Teams */}
          <div className="dashboard-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                My Teams
              </h2>
              <Link to="/student/teams" className="text-sm text-accent hover:underline">
                View all →
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : myTeams.length > 0 ? (
              <div className="space-y-3">
                {myTeams.map((teamName) => (
                  <div
                    key={teamName}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{teamName}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Not part of any team yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Events with Registration */}
        <UpcomingEventsSection />

        {/* Upcoming Events (from approved events) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold">Upcoming Events</h2>
            <Link to="/student/events" className="text-sm text-accent hover:underline">
              View all →
            </Link>
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
              <p className="text-sm text-muted-foreground">Check back later for new events</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
