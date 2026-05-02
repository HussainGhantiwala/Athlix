import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Team, TeamMember, TeamPlayer } from '@/types/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, Users, CheckCircle, Lock, Eye, UserPlus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Teams() {
  const { user, isFaculty } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, [statusFilter]);

  const fetchTeams = async () => {
    setLoading(true);

    let query = supabase
      .from('teams')
      .select(`
        id, name, status, captain_id, university_id, event_sport_id, created_at, source,
        university:universities(name, short_name),
        event_sport:event_sports(
          sport_category:sports_categories(name, icon),
          event:events(name)
        )
      `)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as any);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to fetch teams');
    } else {
      setTeams((data as unknown as Team[]) || []);
    }

    setLoading(false);
  };

  const fetchTeamMembers = async (teamId: string) => {
    setLoadingMembers(true);
    const [membersResult, playersResult] = await Promise.all([
      supabase
        .from('team_members')
        .select(`
          *,
          profile:profiles(full_name, email, avatar_url)
        `)
        .eq('team_id', teamId)
        .order('is_captain', { ascending: false }),
      supabase
        .from('team_players')
        .select('*')
        .eq('team_id', teamId)
        .order('jersey_number', { ascending: true })
        .order('name', { ascending: true }),
    ]);

    if (!membersResult.error) {
      setTeamMembers((membersResult.data as unknown as TeamMember[]) || []);
    } else {
      setTeamMembers([]);
    }

    if (!playersResult.error) {
      setTeamPlayers((playersResult.data as TeamPlayer[]) || []);
    } else {
      setTeamPlayers([]);
    }

    setLoadingMembers(false);
  };

  const handleViewTeam = async (team: Team) => {
    setSelectedTeam(team);
    setIsDetailOpen(true);
    setTeamMembers([]);
    setTeamPlayers([]);
    await fetchTeamMembers(team.id);
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
      fetchTeams();
    }
  };

  const handleLockTeam = async (teamId: string) => {
    const { error } = await supabase
      .from('teams')
      .update({ status: 'locked' })
      .eq('id', teamId);

    if (error) {
      toast.error('Failed to lock team');
    } else {
      toast.success('Team locked for competition');
      fetchTeams();
    }
  };

  const handleSetSeed = async (team: Team, position: number | null) => {
    try {
      // 1. If we are setting a position (not clearing), clear it from any other team in the same sport
      if (position !== null) {
        await supabase
          .from('teams')
          .update({
            seed_position: null,
            is_previous_winner: false,
            is_previous_runner_up: false,
            is_previous_second_runner_up: false,
          })
          .eq('event_sport_id', team.event_sport_id)
          .eq('seed_position', position);
      }

      // 2. Update the target team
      const isWinner = position === 1;
      const isRunnerUp = position === 2;
      const isThird = position === 3;

      const { error } = await supabase
        .from('teams')
        .update({
          seed_position: position,
          is_previous_winner: isWinner,
          is_previous_runner_up: isRunnerUp,
          is_previous_second_runner_up: isThird,
        })
        .eq('id', team.id);

      if (error) throw error;

      toast.success(position ? `Seed ${position} assigned!` : 'Seed cleared');
      fetchTeams();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update seeding');
    }
  };

  const getSportName = (team: Team) => ((team as any).event_sport?.sport_category?.name || 'Unknown Sport');

  const filteredTeams = teams.filter((team) => {
    const q = searchQuery.toLowerCase();
    return (
      team.name.toLowerCase().includes(q) ||
      team.university?.name?.toLowerCase().includes(q) ||
      getSportName(team).toLowerCase().includes(q)
    );
  });

  const sportOptions = useMemo(
    () =>
      Array.from(new Set(teams.map((team) => getSportName(team))))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [teams]
  );

  const groupedTeams = useMemo(() => {
    const grouped: Record<string, Team[]> = {};

    filteredTeams
      .filter((team) => sportFilter === 'all' || getSportName(team) === sportFilter)
      .forEach((team) => {
        const sportName = getSportName(team);
        if (!grouped[sportName]) grouped[sportName] = [];
        grouped[sportName].push(team);
      });

    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredTeams, sportFilter]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Teams</h1>
          <p className="text-muted-foreground">Manage team formations and approvals</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="forming">Forming</SelectItem>
              <SelectItem value="pending_approval">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sportFilter} onValueChange={setSportFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sport" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {sportOptions.map((sport) => (
                <SelectItem key={sport} value={sport}>
                  {sport}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : groupedTeams.length > 0 ? (
          <div className="space-y-8">
            {groupedTeams.map(([sportName, sportTeams]) => (
              <section key={sportName} className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    {sportName}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {sportTeams.length} Team{sportTeams.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sportTeams.map((team) => (
                    <div key={team.id} className="dashboard-card p-4 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center text-2xl">
                            {(team as any).event_sport?.sport_category?.icon || 'T'}
                          </div>
                          <div>
                            <h3 className="font-semibold">{team.name}</h3>
                            <p className="text-sm text-muted-foreground">{team.university?.short_name}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge status={team.status} />
                          {team.seed_position === 1 && <span className="text-[10px] font-bold text-yellow-500 flex items-center gap-1 animate-pulse">🥇 Winner</span>}
                          {team.seed_position === 2 && <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">🥈 Runner-up</span>}
                          {team.seed_position === 3 && <span className="text-[10px] font-bold text-amber-700 flex items-center gap-1">🥉 2nd Runner-up</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="flex-1 min-w-0">
                          <p>{(team as any).event_sport?.sport_category?.name}</p>
                          <p className="truncate">{(team as any).event_sport?.event?.name}</p>
                        </div>
                        {(() => {
                          const src = (team as any).source as string | undefined;
                          if (team.seed_position === 1) return <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-600">🥇 Winner</span>;
                          if (team.seed_position === 2) return <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-400/15 text-slate-500">🥈 Runner-up</span>;
                          if (team.seed_position === 3) return <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-700/15 text-amber-800">🥉 2nd Runner-up</span>;
                          if (src === 'registered') return <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-status-live/15 text-status-live">Registered</span>;
                          if (src === 'demo') return <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">Demo</span>;
                          if (src === 'imported') return <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent-foreground">Imported</span>;
                          return <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Manual</span>;
                        })()}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border">
                        <Button variant="ghost" size="sm" onClick={() => handleViewTeam(team)} className="h-8">
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>

                        {isFaculty && (
                          <div className="flex gap-1 ml-auto">
                            <Button 
                              variant={team.seed_position === 1 ? "default" : "outline"} 
                              size="sm" 
                              className="h-7 px-2 text-[10px]"
                              onClick={() => handleSetSeed(team, team.seed_position === 1 ? null : 1)}
                              title="Set as Winner (Seed 1)"
                            >
                              🥇
                            </Button>
                            <Button 
                              variant={team.seed_position === 2 ? "default" : "outline"} 
                              size="sm" 
                              className="h-7 px-2 text-[10px]"
                              onClick={() => handleSetSeed(team, team.seed_position === 2 ? null : 2)}
                              title="Set as Runner-up (Seed 2)"
                            >
                              🥈
                            </Button>
                            <Button 
                              variant={team.seed_position === 3 ? "default" : "outline"} 
                              size="sm" 
                              className="h-7 px-2 text-[10px]"
                              onClick={() => handleSetSeed(team, team.seed_position === 3 ? null : 3)}
                              title="Set as 2nd Runner-up (Seed 3)"
                            >
                              🥉
                            </Button>
                          </div>
                        )}

                        <div className="w-full flex justify-between gap-2 mt-1">
                          {team.status === 'pending_approval' && isFaculty && (
                            <Button size="sm" onClick={() => handleApproveTeam(team.id)} className="flex-1 h-8">
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />
                              Approve
                            </Button>
                          )}

                          {team.status === 'approved' && isFaculty && (
                            <Button size="sm" variant="outline" onClick={() => handleLockTeam(team.id)} className="flex-1 h-8">
                              <Lock className="h-3.5 w-3.5 mr-1" />
                              Lock
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No teams found</h3>
            <p className="text-muted-foreground">
              {searchQuery ? 'Try adjusting your search query' : 'Teams will appear here once created'}
            </p>
          </div>
        )}
      </div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{(selectedTeam as any)?.event_sport?.sport_category?.icon}</span>
              {selectedTeam?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedTeam?.university?.name} - {(selectedTeam as any)?.event_sport?.sport_category?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium">Team Members</h4>
              <StatusBadge status={selectedTeam?.status || 'forming'} />
            </div>

            {loadingMembers ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : teamMembers.length > 0 || teamPlayers.length > 0 ? (
              <div className="space-y-3">
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={(member as any).profile?.avatar_url} />
                      <AvatarFallback>
                        {(member as any).profile?.full_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium flex items-center gap-2">
                        {(member as any).profile?.full_name}
                        {member.is_captain && (
                          <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                            Captain
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {member.position || 'Player'}
                        {member.jersey_number && ` - #${member.jersey_number}`}
                      </p>
                    </div>
                  </div>
                ))}
                {teamPlayers.map((player) => (
                  <div key={player.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {player.name.charAt(0) || 'P'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium flex items-center gap-2">
                        {player.name}
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Dummy
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Test Player
                        {player.jersey_number && ` - #${player.jersey_number}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No members added yet</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
