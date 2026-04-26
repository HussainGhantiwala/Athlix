import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { LiveMatchCard } from '@/components/dashboard/LiveMatchCard';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Match, Registration } from '@/types/database';
import {
  Target,
  Users,
  ClipboardList,
  Play,
  Edit2,
  UserPlus,
  Trophy,
  Clock,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getTenantScope } from '@/lib/tenant-scope';

interface CoordinatorStats {
  liveMatches: number;
  scheduledMatches: number;
  pendingRegistrations: number;
  teamsManaged: number;
}

export default function CoordinatorDashboard() {
  const { profile, user, universityId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CoordinatorStats>({
    liveMatches: 0,
    scheduledMatches: 0,
    pendingRegistrations: 0,
    teamsManaged: 0,
  });
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<Registration[]>([]);

  useEffect(() => {
    void fetchDashboardData();
    
    // Subscribe to live updates
    const channel = supabase
      .channel('coordinator-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        void fetchLiveMatches();
        void fetchScheduledMatches();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        void fetchLiveMatches();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        void fetchPendingRegistrations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [universityId]);

  const fetchDashboardData = async () => {
    setLoading(true);
    await Promise.all([
      fetchStats(),
      fetchLiveMatches(),
      fetchScheduledMatches(),
      fetchPendingRegistrations(),
    ]);
    setLoading(false);
  };

  const fetchStats = async () => {
    if (!universityId) {
      setStats({
        liveMatches: 0,
        scheduledMatches: 0,
        pendingRegistrations: 0,
        teamsManaged: 0,
      });
      return;
    }

    const tenantScope = await getTenantScope(universityId);

    const [registrationsRes, teamsRes] = await Promise.all([
      supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('university_id', universityId),
      supabase
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('university_id', universityId),
    ]);

    let liveCount = 0;
    let scheduledCount = 0;

    if (tenantScope.eventSportIds.length > 0) {
      const [liveMatchesRes, scheduledMatchesRes] = await Promise.all([
        supabase
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'live')
          .in('event_sport_id', tenantScope.eventSportIds),
        supabase
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'scheduled')
          .or('is_placeholder.is.null,is_placeholder.eq.false')
          .in('event_sport_id', tenantScope.eventSportIds),
      ]);

      liveCount = liveMatchesRes.count || 0;
      scheduledCount = scheduledMatchesRes.count || 0;
    }

    setStats({
      liveMatches: liveCount,
      scheduledMatches: scheduledCount,
      pendingRegistrations: registrationsRes.count || 0,
      teamsManaged: teamsRes.count || 0,
    });
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

  const fetchScheduledMatches = async () => {
    if (!universityId) {
      setScheduledMatches([]);
      return;
    }

    const tenantScope = await getTenantScope(universityId);
    if (tenantScope.eventSportIds.length === 0) {
      setScheduledMatches([]);
      return;
    }

    const { data } = await supabase
      .from('matches')
      .select(`
        id, status, scheduled_at, team_a_id, team_b_id,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        venue:venues(name),
        event_sport:event_sports(sport_category:sports_categories(name, icon))
      `)
      .eq('status', 'scheduled')
      .or('is_placeholder.is.null,is_placeholder.eq.false')
      .in('event_sport_id', tenantScope.eventSportIds)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(5);

    setScheduledMatches((data as unknown as Match[]) || []);
  };

  const fetchPendingRegistrations = async () => {
    if (!universityId) {
      setPendingRegistrations([]);
      return;
    }

    const { data } = await supabase
      .from('registrations')
      .select(`
        id, status, created_at,
        profile:profiles!registrations_user_id_fkey(full_name, email),
        event_sport:event_sports(
          sport_category:sports_categories(name, icon),
          event:events(name)
        )
      `)
      .eq('status', 'pending')
      .eq('university_id', universityId)
      .order('created_at', { ascending: false })
      .limit(5);

    setPendingRegistrations((data as unknown as Registration[]) || []);
  };

  const handleStartMatch = async (matchId: string) => {
    const { error } = await supabase
      .from('matches')
      .update({
        status: 'live',
        started_at: new Date().toISOString(),
        current_editor_id: user?.id,
        editor_locked_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    if (error) {
      toast.error('Failed to start match');
    } else {
      toast.success('Match started!');
      fetchScheduledMatches();
      fetchLiveMatches();
      fetchStats();
    }
  };

  const handleApproveRegistration = async (registrationId: string) => {
    const { error } = await supabase
      .from('registrations')
      .update({
        status: 'approved',
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (error) {
      toast.error('Failed to approve registration');
    } else {
      toast.success('Registration approved!');
      fetchPendingRegistrations();
      fetchStats();
    }
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
              {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'Coordinator'}! 👋
            </h1>
            <p className="text-muted-foreground">
              Student Coordinator Dashboard — Manage live scores, registrations, and teams
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/coordinator/score-control">
                <Edit2 className="mr-2 h-4 w-4" />
                Score Control
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/coordinator/teams/new">
                <Users className="mr-2 h-4 w-4" />
                Create Team
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
                title="Live Matches"
                value={stats.liveMatches}
                icon={Target}
                description="Update scores now"
              />
              <StatsCard
                title="Scheduled"
                value={stats.scheduledMatches}
                icon={Clock}
                description="Ready to start"
              />
              <StatsCard
                title="Pending Registrations"
                value={stats.pendingRegistrations}
                icon={ClipboardList}
                description="Awaiting review"
              />
              <StatsCard
                title="Teams"
                value={stats.teamsManaged}
                icon={Users}
              />
            </>
          )}
        </div>

        {/* Live Matches - Priority Section */}
        {liveMatches.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-status-live rounded-full animate-pulse" />
                <h2 className="text-xl font-display font-bold">Live Matches — Update Scores</h2>
              </div>
              <Link to="/coordinator/matches?status=live" className="text-sm text-accent hover:underline">
                View all →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveMatches.map((match) => (
                <div key={match.id} className="dashboard-card border-2 border-status-live p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">{match.event_sport?.sport_category?.icon}</span>
                    <span className="text-sm font-medium">{match.event_sport?.sport_category?.name}</span>
                    <StatusBadge status="live" className="ml-auto" />
                  </div>
                  
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-center flex-1">
                      <p className="font-semibold text-sm">{match.team_a?.name}</p>
                      <p className="text-2xl font-display font-bold">
                        {match.scores?.find(s => s.team_id === match.team_a_id)?.score_value ?? 0}
                      </p>
                    </div>
                    <span className="text-muted-foreground px-2">vs</span>
                    <div className="text-center flex-1">
                      <p className="font-semibold text-sm">{match.team_b?.name}</p>
                      <p className="text-2xl font-display font-bold">
                        {match.scores?.find(s => s.team_id === match.team_b_id)?.score_value ?? 0}
                      </p>
                    </div>
                  </div>

                  <Button className="w-full" asChild>
                    <Link to="/coordinator/score-control">
                      <Edit2 className="mr-2 h-4 w-4" />
                      Open Score Control
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Upcoming Matches */}
          <div className="dashboard-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-status-scheduled" />
                Upcoming Matches
              </h2>
              <Link to="/coordinator/matches" className="text-sm text-accent hover:underline">
                View all →
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : scheduledMatches.length > 0 ? (
              <div className="space-y-3">
                {scheduledMatches.map(match => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{match.event_sport?.sport_category?.icon}</span>
                      <div>
                        <p className="font-medium text-sm">
                          {match.team_a?.name} vs {match.team_b?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(match.scheduled_at), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleStartMatch(match.id)}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Start
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No upcoming matches</p>
              </div>
            )}
          </div>

          {/* Pending Registrations */}
          <div className="dashboard-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-accent" />
                Pending Registrations
              </h2>
              <Link to="/coordinator/registrations" className="text-sm text-accent hover:underline">
                View all →
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : pendingRegistrations.length > 0 ? (
              <div className="space-y-3">
                {pendingRegistrations.map(reg => (
                  <div
                    key={reg.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                        <UserPlus className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{reg.profile?.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {reg.event_sport?.sport_category?.name} • {reg.event_sport?.event?.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <Link to={`/coordinator/registrations/${reg.id}`}>
                          Review
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApproveRegistration(reg.id)}
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No pending registrations</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dashboard-card p-6">
          <h2 className="text-lg font-display font-bold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link
              to="/coordinator/score-control"
              className="p-4 rounded-lg bg-status-live/10 hover:bg-status-live/20 transition-colors flex items-center gap-3 border border-status-live/20"
            >
              <div className="w-10 h-10 rounded-lg bg-status-live/20 flex items-center justify-center">
                <Edit2 className="h-5 w-5 text-status-live" />
              </div>
              <div>
                <p className="font-medium text-sm">Score Control</p>
                <p className="text-xs text-muted-foreground">Live scoring</p>
              </div>
            </Link>
            <Link
              to="/coordinator/matches"
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-medium text-sm">Matches</p>
                <p className="text-xs text-muted-foreground">View all</p>
              </div>
            </Link>
            <Link
              to="/coordinator/registrations"
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-medium text-sm">Registrations</p>
                <p className="text-xs text-muted-foreground">Process signups</p>
              </div>
            </Link>
            <Link
              to="/coordinator/teams"
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Teams</p>
                <p className="text-xs text-muted-foreground">Manage rosters</p>
              </div>
            </Link>
            <Link
              to="/coordinator/teams/new"
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-status-finalized/10 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-status-finalized" />
              </div>
              <div>
                <p className="font-medium text-sm">Create Team</p>
                <p className="text-xs text-muted-foreground">New team</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Important Notice */}
        <div className="bg-status-provisional/10 border border-status-provisional/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-status-provisional/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Target className="h-4 w-4 text-status-provisional" />
            </div>
            <div>
              <p className="font-medium text-sm">Important Reminder</p>
              <p className="text-sm text-muted-foreground">
                You can update live scores and complete matches directly. Completed matches are finalized
                automatically with final score, winner, and finished status.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
