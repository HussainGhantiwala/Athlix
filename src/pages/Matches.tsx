import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Match, MatchStatus } from '@/types/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, Target, Play, Square, CheckCircle, Edit2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { determineWinnerId, getTeamScores } from '@/lib/match-scoring';

export default function Matches() {
  const { user, role, isStudentCoordinator } = useAuth();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [teamAScore, setTeamAScore] = useState(0);
  const [teamBScore, setTeamBScore] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [finalizeReason, setFinalizeReason] = useState('');
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);

  useEffect(() => {
    fetchMatches();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('matches-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        fetchMatches();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        fetchMatches();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter]);

  const fetchMatches = async () => {
    setLoading(true);
    const query = supabase
      .from('matches')
      .select('*')
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true });

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to fetch matches');
    } else {
      setMatches((data as unknown as Match[]) || []);
    }
    setLoading(false);
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
      fetchMatches();
    }
  };

  const handleOpenScoreDialog = (match: Match) => {
    setSelectedMatch(match);
    const scoreData = (match.score_data || {}) as Record<string, unknown>;
    const scoreA =
      match.scores?.find((s) => s.team_id === match.team_a_id)?.score_value ??
      Number(scoreData.participantAScore ?? scoreData.teamAScore ?? 0);
    const scoreB =
      match.scores?.find((s) => s.team_id === match.team_b_id)?.score_value ??
      Number(scoreData.participantBScore ?? scoreData.teamBScore ?? 0);
    setTeamAScore(scoreA);
    setTeamBScore(scoreB);
    setIsScoreDialogOpen(true);
  };

  const handleUpdateScore = async () => {
    if (!selectedMatch) return;
    setUpdating(true);
    const isParticipantMode =
      !!selectedMatch.participant_a_id ||
      !!selectedMatch.participant_b_id ||
      !!selectedMatch.participant_a_name ||
      !!selectedMatch.participant_b_name;

    if (!isParticipantMode) {
      // Team mode keeps score-table parity.
      const updates = [
        {
          match_id: selectedMatch.id,
          team_id: selectedMatch.team_a_id,
          score_value: teamAScore,
          updated_by: user?.id,
        },
        {
          match_id: selectedMatch.id,
          team_id: selectedMatch.team_b_id,
          score_value: teamBScore,
          updated_by: user?.id,
        },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('scores')
          .upsert(update, { onConflict: 'match_id,team_id' });

        if (error) {
          toast.error('Failed to update score');
          setUpdating(false);
          return;
        }
      }
    }

    await supabase
      .from('matches')
      .update({
        score_data: {
          sport: 'other',
          teamAScore,
          teamBScore,
          participantAScore: teamAScore,
          participantBScore: teamBScore,
        },
      } as any)
      .eq('id', selectedMatch.id);

    toast.success('Score updated!');
    setIsScoreDialogOpen(false);
    setUpdating(false);
    fetchMatches();
  };

  const handleCompleteMatch = async (matchId: string) => {
    const { error } = await supabase
      .from('matches')
      .update({
        status: 'completed',
        end_time: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        current_editor_id: null,
        editor_locked_at: null,
      })
      .eq('id', matchId);

    if (error) {
      toast.error('Failed to complete match');
    } else {
      toast.success('Match completed');
      fetchMatches();
    }
  };

  const handleOpenFinalizeDialog = (match: Match) => {
    setSelectedMatch(match);
    setFinalizeReason('');
    setIsFinalizeDialogOpen(true);
  };

  const handleFinalizeMatch = async () => {
    if (!selectedMatch) return;
    if (role !== 'faculty') {
      toast.error('Only faculty can finalize matches');
      return;
    }

    const winnerId = determineWinnerId(selectedMatch);
    const scoreData = (selectedMatch.score_data || {}) as Record<string, unknown>;
    const participantScoreA = Number(scoreData.participantAScore ?? scoreData.teamAScore ?? 0);
    const participantScoreB = Number(scoreData.participantBScore ?? scoreData.teamBScore ?? 0);
    const participantWinnerId =
      participantScoreA === participantScoreB
        ? null
        : participantScoreA > participantScoreB
          ? selectedMatch.participant_a_id || null
          : selectedMatch.participant_b_id || null;

    const { error } = await supabase
      .from('matches')
      .update({
        status: 'finalized',
        finalized_by: user?.id,
        finalized_at: new Date().toISOString(),
        winner_id: winnerId,
        winner_participant_id: participantWinnerId,
      })
      .eq('id', selectedMatch.id);

    // Log the finalization
    await supabase.from('audit_logs').insert({
      table_name: 'matches',
      record_id: selectedMatch.id,
      action: 'finalize',
      new_data: { status: 'finalized', reason: finalizeReason, winnerId, participantWinnerId },
      performed_by: user?.id,
    });

    if (error) {
      toast.error('Failed to finalize match');
    } else {
      toast.success('Match finalized!');
      setIsFinalizeDialogOpen(false);
      fetchMatches();
    }
  };

  const filteredMatches = matches.filter((match) =>
    (
      match.participant_a_name ||
      match.participant_a?.name ||
      match.team_a?.name ||
      ''
    ).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (
      match.participant_b_name ||
      match.participant_b?.name ||
      match.team_b?.name ||
      ''
    ).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (match.sport_id || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Matches</h1>
          <p className="text-muted-foreground">View and manage match scores</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search matches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Matches List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : filteredMatches.length > 0 ? (
          <div className="space-y-4">
            {filteredMatches.map((match) => {
              const { teamAScore: scoreA, teamBScore: scoreB } = getTeamScores(match);

              return (
                <div
                  key={match.id}
                  className={cn(
                    'dashboard-card p-4',
                    match.status === 'live' && 'border-status-live border-2'
                  )}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Sport & Event Info */}
                    <div className="flex items-center gap-3 lg:w-48">
                      <span className="text-2xl">{match.event_sport?.sport_category?.icon}</span>
                      <div>
                        <p className="font-medium">{match.event_sport?.sport_category?.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {match.event_sport?.event?.name}
                        </p>
                      </div>
                    </div>

                    {/* Teams & Score */}
                    <div className="flex-1 flex items-center justify-center gap-4">
                      <div className="text-right flex-1">
                        <p className="font-semibold">
                          {match.participant_a_name || match.participant_a?.name || match.team_a?.name || 'TBD'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {match.team_a?.university?.short_name}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 px-4">
                        <span
                          className={cn(
                            'text-2xl font-display font-bold',
                            scoreA > scoreB && 'text-accent'
                          )}
                        >
                          {scoreA}
                        </span>
                        <span className="text-muted-foreground">-</span>
                        <span
                          className={cn(
                            'text-2xl font-display font-bold',
                            scoreB > scoreA && 'text-accent'
                          )}
                        >
                          {scoreB}
                        </span>
                      </div>

                      <div className="text-left flex-1">
                        <p className="font-semibold">
                          {match.participant_b_name || match.participant_b?.name || match.team_b?.name || 'TBD'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {match.team_b?.university?.short_name}
                        </p>
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center gap-3 lg:w-64 justify-end">
                      <div className="text-right mr-2">
                        <StatusBadge status={match.status} />
                        <p className="text-xs text-muted-foreground mt-1">
                          <Clock className="inline h-3 w-3 mr-1" />
                          {format(new Date(match.scheduled_at), 'MMM d, HH:mm')}
                        </p>
                      </div>

                      {/* Action buttons based on status and role */}
                      {match.status === 'scheduled' && isStudentCoordinator && (
                        <Button size="sm" onClick={() => handleStartMatch(match.id)}>
                          <Play className="h-4 w-4 mr-1" />
                          Start
                        </Button>
                      )}

                      {match.status === 'live' && isStudentCoordinator && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenScoreDialog(match)}
                          >
                            <Edit2 className="h-4 w-4 mr-1" />
                            Score
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleCompleteMatch(match.id)}
                          >
                            <Square className="h-4 w-4 mr-1" />
                            End
                          </Button>
                        </>
                      )}

                      {match.status === 'completed' && role === 'faculty' && (
                        <Button
                          size="sm"
                          onClick={() => handleOpenFinalizeDialog(match)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Finalize
                        </Button>
                      )}
                    </div>
                  </div>

                  {match.venue && (
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                      📍 {match.venue.name}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No matches found</h3>
            <p className="text-muted-foreground">
              {searchQuery ? 'Try adjusting your search query' : 'Matches will appear here once scheduled'}
            </p>
          </div>
        )}
      </div>

      {/* Score Update Dialog */}
      <Dialog open={isScoreDialogOpen} onOpenChange={setIsScoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Score</DialogTitle>
            <DialogDescription>
              Update the live score for this match
            </DialogDescription>
          </DialogHeader>
          {selectedMatch && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    {selectedMatch.participant_a_name || selectedMatch.participant_a?.name || selectedMatch.team_a?.name || 'Participant A'}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={teamAScore}
                    onChange={(e) => setTeamAScore(parseInt(e.target.value) || 0)}
                    className="text-2xl font-bold text-center"
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    {selectedMatch.participant_b_name || selectedMatch.participant_b?.name || selectedMatch.team_b?.name || 'Participant B'}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={teamBScore}
                    onChange={(e) => setTeamBScore(parseInt(e.target.value) || 0)}
                    className="text-2xl font-bold text-center"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScoreDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateScore} disabled={updating}>
              {updating ? 'Updating...' : 'Update Score'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize Dialog */}
      <Dialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Match</DialogTitle>
            <DialogDescription>
              Confirm the final score. This action cannot be undone without reopening the match.
            </DialogDescription>
          </DialogHeader>
          {selectedMatch && (
            <div className="space-y-4 py-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Final Score</p>
                <div className="flex items-center justify-center gap-4">
                  <div>
                    <p className="font-semibold">
                      {selectedMatch.participant_a_name || selectedMatch.participant_a?.name || selectedMatch.team_a?.name}
                    </p>
                    <p className="text-3xl font-display font-bold">
                      {getTeamScores(selectedMatch).teamAScore}
                    </p>
                  </div>
                  <span className="text-xl text-muted-foreground">vs</span>
                  <div>
                    <p className="font-semibold">
                      {selectedMatch.participant_b_name || selectedMatch.participant_b?.name || selectedMatch.team_b?.name}
                    </p>
                    <p className="text-3xl font-display font-bold">
                      {getTeamScores(selectedMatch).teamBScore}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Any notes about the match..."
                  value={finalizeReason}
                  onChange={(e) => setFinalizeReason(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFinalizeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleFinalizeMatch}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Confirm & Finalize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
