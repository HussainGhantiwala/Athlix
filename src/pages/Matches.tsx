import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Match } from '@/types/database';
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
import { Search, Target, CheckCircle, Edit2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function Matches() {
  const navigate = useNavigate();
  const { user, isAdmin, isFaculty, isStudentCoordinator } = useAuth();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [finalizeReason, setFinalizeReason] = useState('');
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);

  useEffect(() => {
    fetchMatches();
  }, [statusFilter]);

  const fetchMatches = async () => {
    setLoading(true);
    let query = supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        venue:venues(name),
        event_sport:event_sports(
          sport_category:sports_categories(name, icon),
          event:events(name)
        )
      `)
      .order('scheduled_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as any);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to fetch matches');
    } else {
      setMatches((data as unknown as Match[]) || []);
    }
    setLoading(false);
  };

  const handleOpenFinalizeDialog = (match: Match) => {
    setSelectedMatch(match);
    setFinalizeReason('');
    setIsFinalizeDialogOpen(true);
  };

  const handleFinalizeMatch = async () => {
    if (!selectedMatch) return;

    const scoreA = selectedMatch.score_a ?? selectedMatch.runs_a ?? 0;
    const scoreB = selectedMatch.score_b ?? selectedMatch.runs_b ?? 0;

    const winnerId = scoreA > scoreB ? selectedMatch.team_a_id : scoreB > scoreA ? selectedMatch.team_b_id : null;
    const isDraw = scoreA === scoreB;

    const round = String(selectedMatch.round || '').toLowerCase();
    const isKnockoutRound = ['round_of_16', 'quarterfinal', 'semifinal', 'final'].includes(round);
    let resultStatus: string = isDraw ? 'draw' : 'completed';
    if (isKnockoutRound && winnerId && selectedMatch.next_match_id) {
      resultStatus = 'advanced';
    }

    const { error } = await supabase
      .from('matches')
      .update({
        status: 'finalized',
        finalized_by: user?.id,
        finalized_at: new Date().toISOString(),
        winner_id: winnerId || undefined,
        winner_team_id: winnerId || undefined,
        result_status: resultStatus,
        phase: 'finished',
      })
      .eq('id', selectedMatch.id);

    if (!error && winnerId && selectedMatch.next_match_id) {
      const { data: nextMatch } = await supabase
        .from('matches')
        .select('id, team_a_id, team_b_id')
        .eq('id', selectedMatch.next_match_id)
        .single();

      if (nextMatch) {
        const patch: Record<string, string> = {};
        if (!nextMatch.team_a_id) patch.team_a_id = winnerId;
        else if (!nextMatch.team_b_id) patch.team_b_id = winnerId;
        if (Object.keys(patch).length > 0) {
          await supabase.from('matches').update(patch as any).eq('id', nextMatch.id);
        }
      }
    }

    await supabase.from('audit_logs').insert({
      table_name: 'matches',
      record_id: selectedMatch.id,
      action: 'finalize',
      new_data: { status: 'finalized', reason: finalizeReason },
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
    match.team_a?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    match.team_b?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    match.event_sport?.sport_category?.name?.toLowerCase().includes(searchQuery.toLowerCase())
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
              <SelectItem value="completed_provisional">Provisional</SelectItem>
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
              const scoreB = match.score_b ?? match.runs_b ?? 0;
              const scoreAValue = match.score_a ?? match.runs_a ?? 0;

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
                     <div className="flex items-center gap-3 lg:w-56">
                      <span className="text-2xl">{match.event_sport?.sport_category?.icon}</span>
                      <div>
                        <p className="font-medium">{match.event_sport?.sport_category?.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {match.event_sport?.event?.name}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {match.phase && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
                              {match.phase}
                            </span>
                          )}
                          {match.group_name && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                              Group {match.group_name}
                            </span>
                          )}
                          {match.round && (
                            <span className="text-xs text-muted-foreground">
                              {match.round}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Teams & Score */}
                    <div className="flex-1 flex items-center justify-center gap-4">
                      <div className="text-right flex-1">
                        <p className="font-semibold">{match.team_a?.name || 'TBD'}</p>
                        <p className="text-xs text-muted-foreground">
                          {match.team_a?.university?.short_name}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 px-4">
                        <span
                          className={cn(
                            'text-2xl font-display font-bold',
                            scoreAValue > scoreB && 'text-accent'
                          )}
                        >
                          {scoreAValue}
                        </span>
                        <span className="text-muted-foreground">-</span>
                        <span
                          className={cn(
                            'text-2xl font-display font-bold',
                            scoreB > scoreAValue && 'text-accent'
                          )}
                        >
                          {scoreB}
                        </span>
                      </div>

                      <div className="text-left flex-1">
                        <p className="font-semibold">{match.team_b?.name || 'TBD'}</p>
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

                      {/* Coordinator/Faculty: redirect to Score Control for live scoring */}
                      {match.status === 'live' && isStudentCoordinator && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/coordinator/score-control?match=${match.id}`)}
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Score
                        </Button>
                      )}

                      {match.status === 'completed_provisional' && isFaculty && (
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

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    {match.venue && (
                      <p className="text-xs text-muted-foreground">📍 {match.venue.name}</p>
                    )}
                    {match.winner_team_id && match.status === 'finalized' && (
                      <span className="text-xs font-semibold text-accent flex items-center gap-1">
                        🏆 Winner: {match.winner_team_id === match.team_a_id ? match.team_a?.name : match.team_b?.name}
                        {match.result_status === 'advanced' && (
                          <span className="text-accent"> — ➡ Advanced</span>
                        )}
                      </span>
                    )}
                    {match.result_status === 'eliminated' && (
                      <span className="text-xs text-destructive">❌ Eliminated</span>
                    )}
                    {match.result_status === 'draw' && (
                      <span className="text-xs text-muted-foreground">🤝 Draw</span>
                    )}
                  </div>
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
                    <p className="font-semibold">{selectedMatch.team_a?.name}</p>
                    <p className="text-3xl font-display font-bold">
                      {selectedMatch.score_a != null ? selectedMatch.score_a : selectedMatch.runs_a ?? 0}
                    </p>
                  </div>
                  <span className="text-xl text-muted-foreground">vs</span>
                  <div>
                    <p className="font-semibold">{selectedMatch.team_b?.name}</p>
                    <p className="text-3xl font-display font-bold">
                      {selectedMatch.score_b != null ? selectedMatch.score_b : selectedMatch.runs_b ?? 0}
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
