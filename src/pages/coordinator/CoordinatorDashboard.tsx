import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Match } from '@/types/database';
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
import { getTeamScores } from '@/lib/match-scoring';

interface CoordinatorStats {
  liveMatches: number;
  scheduledMatches: number;
  pendingRegistrations: number;
  teamsManaged: number;
}

interface PendingRegistration {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  team_name: string | null;
  event?: { name: string } | null;
  sport?: { name: string; icon: string | null } | null;
  profile?: { full_name: string; email: string } | null;
}

export default function CoordinatorDashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CoordinatorStats>({
    liveMatches: 0,
    scheduledMatches: 0,
    pendingRegistrations: 0,
    teamsManaged: 0,
  });
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistration[]>([]);

  useEffect(() => {
    void (async () => {
      await fetchDashboardData();
    })();

    const channel = supabase
      .channel('coordinator-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        void fetchLiveMatches();
        void fetchScheduledMatches();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        void fetchLiveMatches();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_submissions' }, () => {
        void fetchPendingRegistrations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    const [matchesRes, registrationsRes, teamNamesRes] = await Promise.all([
      supabase.from('matches').select('id, status', { count: 'exact' }),
      supabase
        .from('registration_submissions')
        .select('id', { count: 'exact' }),
      supabase
        .from('registration_submissions')
        .select('team_name')
        .not('team_name', 'is', null),
    ]);

    const liveCount = matchesRes.data?.filter((m) => m.status === 'live').length || 0;
    const scheduledCount = matchesRes.data?.filter((m) => m.status === 'scheduled').length || 0;
    const distinctTeamNames = new Set<string>();
    (teamNamesRes.data || []).forEach((row) => {
      const name = row.team_name?.trim();
      if (name) distinctTeamNames.add(name);
    });

    setStats({
      liveMatches: liveCount,
      scheduledMatches: scheduledCount,
      pendingRegistrations: registrationsRes.count || 0,
      teamsManaged: distinctTeamNames.size,
    });
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

  const fetchScheduledMatches = async () => {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'scheduled')
      .order('scheduled_at')
      .limit(5);

    setScheduledMatches((data as unknown as Match[]) || []);
  };

  const fetchPendingRegistrations = async () => {
    const { data } = await supabase
      .from('registration_submissions')
      .select(`
        id,
        user_id,
        status,
        created_at,
        team_name,
        event:events(name),
        sport:sports_categories(name, icon)
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    const pending = (data as unknown as PendingRegistration[]) || [];
    if (!pending.length) {
      setPendingRegistrations([]);
      return;
    }

    const userIds = [...new Set(pending.map((row) => row.user_id).filter(Boolean))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const withProfiles = pending.map((row) => ({
      ...row,
      profile: profileMap.get(row.user_id) || null,
    }));
    setPendingRegistrations(withProfiles);
  };

  const handleStartMatch = async (matchId: string) => {
    const { error } = await supabase
      .from('matches')
      .update({
        status: 'live',
      })
      .eq('id', matchId);

    if (error) {
      toast.error('Failed to start match');
    } else {
      toast.success('Match started!');
      void fetchScheduledMatches();
      void fetchLiveMatches();
      void fetchStats();
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
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl lg:text-3xl font-display font-bold">
              {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'Coordinator'}!
            </h1>
            <p className="text-muted-foreground">
              Student Coordinator Dashboard - Manage live scores, submissions, and teams
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/coordinator/teams/new">
                <Users className="mr-2 h-4 w-4" />
                Create Team
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))
          ) : (
            <>
              <StatsCard title="Live Matches" value={stats.liveMatches} icon={Target} description="Update scores now" />
              <StatsCard title="Scheduled" value={stats.scheduledMatches} icon={Clock} description="Ready to start" />
              <StatsCard
                title="Registrations"
                value={stats.pendingRegistrations}
                icon={ClipboardList}
                description="Recent submissions"
              />
              <StatsCard title="Teams" value={stats.teamsManaged} icon={Users} />
            </>
          )}
        </div>

        {liveMatches.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-status-live rounded-full animate-pulse" />
                <h2 className="text-xl font-display font-bold">Live Matches - Update Scores</h2>
              </div>
              <Link to="/coordinator/matches?status=live" className="text-sm text-accent hover:underline">
                View all
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
                      <p className="font-semibold text-sm">
                        {match.participant_a_name || match.participant_a?.name || match.team_a?.name}
                      </p>
                      <p className="text-2xl font-display font-bold">{getTeamScores(match).teamAScore}</p>
                    </div>
                    <span className="text-muted-foreground px-2">vs</span>
                    <div className="text-center flex-1">
                      <p className="font-semibold text-sm">
                        {match.participant_b_name || match.participant_b?.name || match.team_b?.name}
                      </p>
                      <p className="text-2xl font-display font-bold">{getTeamScores(match).teamBScore}</p>
                    </div>
                  </div>

                  <Button className="w-full" asChild>
                    <Link to={`/coordinator/matches/${match.id}/score`}>
                      <Edit2 className="mr-2 h-4 w-4" />
                      Update Score
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="dashboard-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-status-scheduled" />
                Upcoming Matches
              </h2>
              <Link to="/coordinator/matches" className="text-sm text-accent hover:underline">
                View all
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
                {scheduledMatches.map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{match.event_sport?.sport_category?.icon}</span>
                      <div>
                        <p className="font-medium text-sm">
                          {match.participant_a_name || match.participant_a?.name || match.team_a?.name} vs {match.participant_b_name || match.participant_b?.name || match.team_b?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(match.scheduled_at), 'MMM d, HH:mm')}
                          {match.event_sport?.event?.start_date
                            ? ` | Event starts ${match.event_sport.event.start_date}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleStartMatch(match.id)}>
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

          <div className="dashboard-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-accent" />
                Recent Registrations
              </h2>
              <Link to="/coordinator/submissions" className="text-sm text-accent hover:underline">
                View all
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
                {pendingRegistrations.map((reg) => (
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
                          {reg.sport?.name} • {reg.event?.name}
                          {reg.team_name ? ` • ${reg.team_name}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/coordinator/submissions">Review</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No registrations yet</p>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-card p-6">
          <h2 className="text-lg font-display font-bold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link
              to="/coordinator/matches"
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-status-live/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-status-live" />
              </div>
              <div>
                <p className="font-medium text-sm">Matches</p>
                <p className="text-xs text-muted-foreground">Update scores</p>
              </div>
            </Link>
            <Link
              to="/coordinator/submissions"
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-medium text-sm">Submissions</p>
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

        <div className="bg-status-provisional/10 border border-status-provisional/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-status-provisional/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Target className="h-4 w-4 text-status-provisional" />
            </div>
            <div>
              <p className="font-medium text-sm">Important Reminder</p>
              <p className="text-sm text-muted-foreground">
                You can update live scores and mark matches as completed (provisional), but only faculty can
                finalize results.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
