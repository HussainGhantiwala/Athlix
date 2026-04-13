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
import { Match, Event, Registration, Team } from '@/types/database';
import {
  Calendar,
  Users,
  Target,
  Trophy,
  ClipboardCheck,
  Clock,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { UpcomingEventsSection } from '@/components/student/UpcomingEventsSection';
import { getTenantScope } from '@/lib/tenant-scope';

interface StudentStats {
  myRegistrations: number;
  myTeams: number;
  upcomingEvents: number;
  liveMatches: number;
}

export default function StudentDashboard() {
  const { profile, user, universityId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StudentStats>({
    myRegistrations: 0,
    myTeams: 0,
    upcomingEvents: 0,
    liveMatches: 0,
  });
  const [myRegistrations, setMyRegistrations] = useState<Registration[]>([]);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (user?.id) {
      void fetchDashboardData();
      
      // Subscribe to live updates
      const channel = supabase
        .channel('student-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
          void fetchLiveMatches();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
          void fetchLiveMatches();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [universityId, user?.id]);

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
    const [registrationsRes, teamsRes, eventsRes] = await Promise.all([
      supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('user_id', user?.id || ''),
      supabase.from('team_members').select('id', { count: 'exact', head: true }).eq('user_id', user?.id || ''),
      universityId
        ? supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .in('status', ['approved', 'active'])
            .eq('university_id', universityId)
        : supabase.from('events').select('id', { count: 'exact', head: true }).eq('id', '__none__'),
    ]);

    let liveMatchCount = 0;
    if (universityId) {
      const tenantScope = await getTenantScope(universityId);
      if (tenantScope.eventSportIds.length > 0) {
        const { count } = await supabase
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'live')
          .in('event_sport_id', tenantScope.eventSportIds);
        liveMatchCount = count || 0;
      }
    }

    setStats({
      myRegistrations: registrationsRes.count || 0,
      myTeams: teamsRes.count || 0,
      upcomingEvents: eventsRes.count || 0,
      liveMatches: liveMatchCount,
    });
  };

  const fetchMyRegistrations = async () => {
    const { data } = await supabase
      .from('registrations')
      .select(`
        *,
        event_sport:event_sports(
          sport_category:sports_categories(name, icon),
          event:events(name, start_date, end_date)
        )
      `)
      .eq('user_id', user?.id || '')
      .order('created_at', { ascending: false })
      .limit(5);

    setMyRegistrations((data as unknown as Registration[]) || []);
  };

  const fetchMyTeams = async () => {
    const { data: teamMemberships } = await supabase
      .from('team_members')
      .select(`
        team:teams(
          *,
          university:universities(name, short_name),
          event_sport:event_sports(
            sport_category:sports_categories(name, icon),
            event:events(name)
          )
        )
      `)
      .eq('user_id', user?.id || '');

    const teams = teamMemberships?.map(tm => tm.team).filter(Boolean) || [];
    setMyTeams(teams as unknown as Team[]);
  };

  const fetchLiveMatches = async () => {
    if (!universityId) {
      setLiveMatches([]);
      return;
    }

    const tenantScope = await getTenantScope(universityId);
    if (tenantScope.eventSportIds.length === 0) {
      setLiveMatches([]);
      return;
    }

    const { data } = await supabase
      .from('matches')
      .select(`
        id, status, started_at, scheduled_at, team_a_id, team_b_id, score_a, score_b, runs_a, runs_b, wickets_a, wickets_b, balls_a, balls_b, innings, target_score, match_phase,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        venue:venues(name),
        event_sport:event_sports(sport_category:sports_categories(name, icon)),
        scores(id, team_id, score_value)
      `)
      .eq('status', 'live')
      .in('event_sport_id', tenantScope.eventSportIds)
      .order('started_at', { ascending: false })
      .limit(6);

    setLiveMatches((data as unknown as Match[]) || []);
  };

  const fetchUpcomingEvents = async () => {
    if (!universityId) {
      setUpcomingEvents([]);
      return;
    }

    const { data } = await supabase
      .from('events')
      .select(`id, university_id, name, start_date, end_date, status, tournament_type, banner_url, university:universities(short_name)`)
      .in('status', ['approved', 'active'])
      .eq('university_id', universityId)
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
                      <span className="text-xl">{reg.event_sport?.sport_category?.icon}</span>
                      <div>
                        <p className="font-medium text-sm">{reg.event_sport?.sport_category?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {reg.event_sport?.event?.name}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={reg.status as any} />
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
                {myTeams.map(team => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{team.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {team.university?.short_name}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={team.status as any} />
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
