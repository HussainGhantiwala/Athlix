import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { LiveMatchCard } from '@/components/dashboard/LiveMatchCard';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Match, Team } from '@/types/database';
import {
  Calendar,
  Users,
  Target,
  ClipboardList,
  CheckCircle,
  Clock,
  DollarSign,
  Trophy,
  AlertTriangle,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getTenantScope } from '@/lib/tenant-scope';

interface FacultyStats {
  assignedEvents: number;
  pendingTeams: number;
  provisionalMatches: number;
  pendingBudgets: number;
  liveMatches: number;
  totalMatches: number;
}

export default function FacultyDashboard() {
  const { profile, user, universityId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FacultyStats>({
    assignedEvents: 0,
    pendingTeams: 0,
    provisionalMatches: 0,
    pendingBudgets: 0,
    liveMatches: 0,
    totalMatches: 0,
  });
  const [pendingTeams, setPendingTeams] = useState<Team[]>([]);
  const [provisionalMatches, setProvisionalMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);

  useEffect(() => {
    void fetchDashboardData();
    
    // Subscribe to live updates
    const channel = supabase
      .channel('faculty-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        void fetchLiveMatches();
        void fetchProvisionalMatches();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        void fetchPendingTeams();
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
      fetchPendingTeams(),
      fetchProvisionalMatches(),
      fetchLiveMatches(),
    ]);
    setLoading(false);
  };

  const fetchStats = async () => {
    const [assignmentsRes, teamsRes, budgetsRes] = await Promise.all([
      supabase.from('coordinator_assignments').select('id', { count: 'exact', head: true }).eq('user_id', user?.id || ''),
      universityId
        ? supabase
            .from('teams')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending_approval')
            .eq('university_id', universityId)
        : supabase.from('teams').select('id', { count: 'exact', head: true }).eq('id', '__none__'),
      supabase.from('budgets').select('id', { count: 'exact', head: true }).eq('submitted_by', user?.id || ''),
    ]);

    let provisionalCount = 0;
    let liveCount = 0;
    let totalMatches = 0;

    if (universityId) {
      const tenantScope = await getTenantScope(universityId);
      if (tenantScope.eventSportIds.length > 0) {
        const [completedMatchesRes, liveMatchesRes, totalMatchesRes] = await Promise.all([
          supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'completed')
            .in('event_sport_id', tenantScope.eventSportIds),
          supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'live')
            .in('event_sport_id', tenantScope.eventSportIds),
          supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .in('event_sport_id', tenantScope.eventSportIds),
        ]);

        provisionalCount = completedMatchesRes.count || 0;
        liveCount = liveMatchesRes.count || 0;
        totalMatches = totalMatchesRes.count || 0;
      }
    }

    setStats({
      assignedEvents: assignmentsRes.count || 0,
      pendingTeams: teamsRes.count || 0,
      provisionalMatches: provisionalCount,
      pendingBudgets: budgetsRes.count || 0,
      liveMatches: liveCount,
      totalMatches,
    });
  };

  const fetchPendingTeams = async () => {
    if (!universityId) {
      setPendingTeams([]);
      return;
    }

    const { data } = await supabase
      .from('teams')
      .select(`
        id, name, status, created_at,
        university:universities(name, short_name),
        event_sport:event_sports(
          sport_category:sports_categories(name, icon),
          event:events(name)
        )
      `)
      .eq('status', 'pending_approval')
      .eq('university_id', universityId)
      .order('created_at', { ascending: false })
      .limit(5);

    setPendingTeams((data as unknown as Team[]) || []);
  };

  const fetchProvisionalMatches = async () => {
    if (!universityId) {
      setProvisionalMatches([]);
      return;
    }

    const tenantScope = await getTenantScope(universityId);
    if (tenantScope.eventSportIds.length === 0) {
      setProvisionalMatches([]);
      return;
    }

    const { data } = await supabase
      .from('matches')
      .select(`
        id, status, completed_at, team_a_id, team_b_id, score_a, score_b, runs_a, runs_b,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        venue:venues(name),
        event_sport:event_sports(sport_category:sports_categories(name, icon)),
        scores(id, team_id, score_value)
      `)
      .eq('status', 'completed')
      .in('event_sport_id', tenantScope.eventSportIds)
      .order('completed_at', { ascending: false })
      .limit(5);

    setProvisionalMatches((data as unknown as Match[]) || []);
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
      .limit(4);

    setLiveMatches((data as unknown as Match[]) || []);
  };

  const handleApproveTeam = async (teamId: string) => {
    const { error } = await supabase
      .from('teams')
      .update({
        status: 'approved',
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', teamId);

    if (error) {
      toast.error('Failed to approve team');
    } else {
      toast.success('Team approved!');
      fetchPendingTeams();
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
              {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'Faculty'}! ðŸ‘‹
            </h1>
            <p className="text-muted-foreground">
              Faculty Coordinator Dashboard â€” Manage events, teams, and completed matches
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/faculty/budgets/new">
                <DollarSign className="mr-2 h-4 w-4" />
                Submit Budget
              </Link>
            </Button>
            <Button asChild>
              <Link to="/faculty/matches">
                <Target className="mr-2 h-4 w-4" />
                Manage Matches
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
                description="Happening now"
              />
              <StatsCard
                title="Finished Matches"
                value={stats.provisionalMatches}
                icon={Clock}
                description="Completed automatically"
              />
              <StatsCard
                title="Pending Teams"
                value={stats.pendingTeams}
                icon={Users}
                description="Awaiting approval"
              />
              <StatsCard
                title="Assigned Events"
                value={stats.assignedEvents}
                icon={Calendar}
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {liveMatches.map((match) => (
                <LiveMatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Finished Matches */}
          <div className="dashboard-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-status-provisional" />
                Recent Finished Matches
              </h2>
              <Link to="/faculty/matches?status=completed" className="text-sm text-accent hover:underline">
                View all â†’
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : provisionalMatches.length > 0 ? (
              <div className="space-y-3">
                {provisionalMatches.map(match => {
                  const scoreA = match.scores?.find(s => s.team_id === match.team_a_id)?.score_value ?? 0;
                  const scoreB = match.scores?.find(s => s.team_id === match.team_b_id)?.score_value ?? 0;

                  return (
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
                            Score: {scoreA} - {scoreB}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={match.status} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-status-finalized mx-auto mb-3" />
                <p className="text-muted-foreground">No completed matches yet</p>
              </div>
            )}
          </div>

          {/* Pending Team Approvals */}
          <div className="dashboard-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-accent" />
                Team Approvals
              </h2>
              <Link to="/faculty/teams" className="text-sm text-accent hover:underline">
                View all â†’
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : pendingTeams.length > 0 ? (
              <div className="space-y-3">
                {pendingTeams.map(team => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{team.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {team.university?.short_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <Link to={`/faculty/teams/${team.id}`}>
                          Review
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApproveTeam(team.id)}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-status-finalized mx-auto mb-3" />
                <p className="text-muted-foreground">No teams pending approval</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dashboard-card p-6">
          <h2 className="text-lg font-display font-bold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link
              to="/faculty/events"
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-medium text-sm">Events</p>
                <p className="text-xs text-muted-foreground">Configure sports</p>
              </div>
            </Link>
            <Link
              to="/faculty/registrations"
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Registrations</p>
                <p className="text-xs text-muted-foreground">Manage forms</p>
              </div>
            </Link>
            <Link
              to="/faculty/teams"
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-status-live/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-status-live" />
              </div>
              <div>
                <p className="font-medium text-sm">Teams</p>
                <p className="text-xs text-muted-foreground">Review & approve</p>
              </div>
            </Link>
            <Link
              to="/faculty/matches"
              className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-status-finalized/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-status-finalized" />
              </div>
              <div>
                <p className="font-medium text-sm">Matches</p>
                <p className="text-xs text-muted-foreground">Finished and live scores</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

