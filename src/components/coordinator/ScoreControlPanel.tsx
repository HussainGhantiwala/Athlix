import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Play, Square, Edit2, Target, Loader2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Match } from '@/types/database';

export default function ScoreControlPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [teamAScore, setTeamAScore] = useState(0);
  const [teamBScore, setTeamBScore] = useState(0);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchMatches();

    const channel = supabase
      .channel('score-control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchMatches())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => fetchMatches())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchMatches = async () => {
    setLoading(true);
    const [liveRes, scheduledRes] = await Promise.all([
      supabase
        .from('matches')
        .select(`
          *, team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
          team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
          venue:venues(name), event_sport:event_sports(sport_category:sports_categories(name, icon)),
          scores(*)
        `)
        .eq('status', 'live')
        .order('started_at', { ascending: false }),
      supabase
        .from('matches')
        .select(`
          *, team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
          team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
          venue:venues(name), event_sport:event_sports(sport_category:sports_categories(name, icon)),
          scores(*)
        `)
        .eq('status', 'scheduled')
        .order('scheduled_at')
        .limit(10),
    ]);

    setLiveMatches((liveRes.data as unknown as Match[]) || []);
    setScheduledMatches((scheduledRes.data as unknown as Match[]) || []);
    setLoading(false);
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

    if (error) toast.error('Failed to start match');
    else { toast.success('Match started — LIVE!'); fetchMatches(); }
  };

  const handleOpenScore = (match: Match) => {
    setSelectedMatch(match);
    setTeamAScore(match.scores?.find(s => s.team_id === match.team_a_id)?.score_value ?? 0);
    setTeamBScore(match.scores?.find(s => s.team_id === match.team_b_id)?.score_value ?? 0);
    setIsScoreDialogOpen(true);
  };

  const handleUpdateScore = async () => {
    if (!selectedMatch) return;
    setUpdating(true);

    for (const update of [
      { match_id: selectedMatch.id, team_id: selectedMatch.team_a_id!, score_value: teamAScore, updated_by: user?.id },
      { match_id: selectedMatch.id, team_id: selectedMatch.team_b_id!, score_value: teamBScore, updated_by: user?.id },
    ]) {
      const { error } = await supabase.from('scores').upsert(update, { onConflict: 'match_id,team_id' });
      if (error) { toast.error('Failed to update score'); setUpdating(false); return; }
    }

    toast.success('Score updated!');
    setIsScoreDialogOpen(false);
    setUpdating(false);
    fetchMatches();
  };

  const handleEndMatch = async (matchId: string) => {
    const { error } = await supabase
      .from('matches')
      .update({
        status: 'completed_provisional',
        completed_at: new Date().toISOString(),
        current_editor_id: null,
        editor_locked_at: null,
      })
      .eq('id', matchId);

    if (error) toast.error('Failed to end match');
    else { toast.success('Match completed (provisional). Awaiting faculty finalization.'); fetchMatches(); }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Score Control Panel</h1>
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Score Control Panel</h1>
          <p className="text-muted-foreground">Manage live match scores in real-time</p>
        </div>

        {/* Live Matches */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-status-live rounded-full animate-pulse" />
            <h2 className="text-xl font-display font-bold">Live Matches ({liveMatches.length})</h2>
          </div>

          {liveMatches.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {liveMatches.map(match => {
                const scoreA = match.scores?.find(s => s.team_id === match.team_a_id)?.score_value ?? 0;
                const scoreB = match.scores?.find(s => s.team_id === match.team_b_id)?.score_value ?? 0;

                return (
                  <div key={match.id} className="dashboard-card border-2 border-status-live p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{match.event_sport?.sport_category?.icon}</span>
                        <span className="font-medium text-sm">{match.event_sport?.sport_category?.name}</span>
                      </div>
                      <StatusBadge status="live" />
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div className="text-center flex-1">
                        <p className="font-bold">{match.team_a?.name}</p>
                        <p className="text-xs text-muted-foreground">{match.team_a?.university?.short_name}</p>
                        <p className="text-4xl font-display font-bold mt-2">{scoreA}</p>
                      </div>
                      <span className="text-2xl text-muted-foreground px-4">vs</span>
                      <div className="text-center flex-1">
                        <p className="font-bold">{match.team_b?.name}</p>
                        <p className="text-xs text-muted-foreground">{match.team_b?.university?.short_name}</p>
                        <p className="text-4xl font-display font-bold mt-2">{scoreB}</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => handleOpenScore(match)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Update Score
                      </Button>
                      <Button variant="outline" className="flex-1" onClick={() => handleEndMatch(match.id)}>
                        <Square className="h-4 w-4 mr-2" />
                        End Match
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-card p-8 text-center">
              <Target className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No live matches. Start a scheduled match below.</p>
            </div>
          )}
        </div>

        {/* Scheduled Matches */}
        <div className="space-y-4">
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Scheduled Matches
          </h2>

          {scheduledMatches.length > 0 ? (
            <div className="space-y-3">
              {scheduledMatches.map(match => (
                <div key={match.id} className="dashboard-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-xl">{match.event_sport?.sport_category?.icon}</span>
                    <div>
                      <p className="font-medium">
                        {match.team_a?.name || 'TBD'} vs {match.team_b?.name || 'TBD'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(match.scheduled_at), 'MMM d, yyyy HH:mm')}
                      </p>
                    </div>
                  </div>

                  {match.venue && (
                    <p className="text-sm text-muted-foreground">📍 {match.venue.name}</p>
                  )}

                  <StatusBadge status="scheduled" />

                  <Button onClick={() => handleStartMatch(match.id)}>
                    <Play className="h-4 w-4 mr-2" />
                    Start Match
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="dashboard-card p-8 text-center">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No scheduled matches</p>
            </div>
          )}
        </div>
      </div>

      {/* Score Update Dialog */}
      <Dialog open={isScoreDialogOpen} onOpenChange={setIsScoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Live Score</DialogTitle>
            <DialogDescription>Update the score. Changes are visible in real-time to all users.</DialogDescription>
          </DialogHeader>
          {selectedMatch && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2 text-center">
                  <Label className="text-base font-semibold">{selectedMatch.team_a?.name}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={teamAScore}
                    onChange={(e) => setTeamAScore(parseInt(e.target.value) || 0)}
                    className="text-3xl font-bold text-center h-16"
                  />
                </div>
                <div className="space-y-2 text-center">
                  <Label className="text-base font-semibold">{selectedMatch.team_b?.name}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={teamBScore}
                    onChange={(e) => setTeamBScore(parseInt(e.target.value) || 0)}
                    className="text-3xl font-bold text-center h-16"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScoreDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateScore} disabled={updating}>
              {updating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Updating...</> : 'Update Score'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
