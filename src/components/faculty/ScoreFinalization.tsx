import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { CheckCircle, RotateCcw, Shield, Trophy, AlertTriangle } from 'lucide-react';
import { Match } from '@/types/database';

export default function ScoreFinalization() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [provisionalMatches, setProvisionalMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false);
  const [isReopenOpen, setIsReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  useEffect(() => {
    fetchMatches();

    const channel = supabase
      .channel('finalization')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchMatches())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => fetchMatches())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchMatches = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('matches')
      .select(`
        *, team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        venue:venues(name), event_sport:event_sports(sport_category:sports_categories(name, icon)),
        scores(*)
      `)
      .in('status', ['completed_provisional', 'finalized'])
      .order('completed_at', { ascending: false })
      .limit(20);

    setProvisionalMatches((data as unknown as Match[]) || []);
    setLoading(false);
  };

  const handleFinalize = async () => {
    if (!selectedMatch) return;

    const scoreA = selectedMatch.scores?.find(s => s.team_id === selectedMatch.team_a_id)?.score_value ?? 0;
    const scoreB = selectedMatch.scores?.find(s => s.team_id === selectedMatch.team_b_id)?.score_value ?? 0;

    // Set winners
    if (selectedMatch.team_a_id) {
      await supabase.from('scores')
        .update({ is_winner: scoreA > scoreB })
        .eq('match_id', selectedMatch.id)
        .eq('team_id', selectedMatch.team_a_id);
    }
    if (selectedMatch.team_b_id) {
      await supabase.from('scores')
        .update({ is_winner: scoreB > scoreA })
        .eq('match_id', selectedMatch.id)
        .eq('team_id', selectedMatch.team_b_id);
    }

    const { error } = await supabase
      .from('matches')
      .update({
        status: 'finalized',
        finalized_by: user?.id,
        finalized_at: new Date().toISOString(),
      })
      .eq('id', selectedMatch.id);

    await supabase.from('audit_logs').insert({
      table_name: 'matches',
      record_id: selectedMatch.id,
      action: 'finalize',
      new_data: { status: 'finalized', scoreA, scoreB },
      performed_by: user?.id,
    });

    if (error) toast.error('Failed to finalize: ' + error.message);
    else { toast.success('Match finalized! Score is now official.'); setIsFinalizeOpen(false); fetchMatches(); }
  };

  const handleReopen = async () => {
    if (!selectedMatch || !reopenReason.trim()) {
      toast.error('Please provide a reason for reopening');
      return;
    }

    // Create reopen request
    await supabase.from('match_reopen_requests').insert({
      match_id: selectedMatch.id,
      reason: reopenReason,
      requested_by: user?.id,
    });

    // Reopen the match
    const { error } = await supabase
      .from('matches')
      .update({
        status: 'live',
        finalized_by: null,
        finalized_at: null,
        current_editor_id: null,
      })
      .eq('id', selectedMatch.id);

    await supabase.from('audit_logs').insert({
      table_name: 'matches',
      record_id: selectedMatch.id,
      action: 'reopen',
      new_data: { reason: reopenReason },
      performed_by: user?.id,
    });

    if (error) toast.error('Failed to reopen');
    else { toast.success('Match reopened for score correction.'); setIsReopenOpen(false); setReopenReason(''); fetchMatches(); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Score Finalization</h1>
          <p className="text-muted-foreground">Review provisional scores and finalize or reopen matches</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : provisionalMatches.length > 0 ? (
          <div className="space-y-4">
            {provisionalMatches.map(match => {
              const scoreA = match.scores?.find(s => s.team_id === match.team_a_id)?.score_value ?? 0;
              const scoreB = match.scores?.find(s => s.team_id === match.team_b_id)?.score_value ?? 0;
              const isProvisional = match.status === 'completed_provisional';
              const isFinalized = match.status === 'finalized';

              return (
                <div key={match.id} className={`dashboard-card p-5 ${isProvisional ? 'border-status-provisional border-2' : ''}`}>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-2xl">{match.event_sport?.sport_category?.icon}</span>
                      <div>
                        <p className="font-medium">{match.event_sport?.sport_category?.name}</p>
                        {match.venue && <p className="text-xs text-muted-foreground">📍 {match.venue.name}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-sm font-medium">{match.team_a?.name}</p>
                        <p className="text-3xl font-display font-bold">{scoreA}</p>
                      </div>
                      <span className="text-muted-foreground">vs</span>
                      <div className="text-center">
                        <p className="text-sm font-medium">{match.team_b?.name}</p>
                        <p className="text-3xl font-display font-bold">{scoreB}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge status={match.status} />

                      {isProvisional && (
                        <Button onClick={() => { setSelectedMatch(match); setIsFinalizeOpen(true); }}>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Finalize
                        </Button>
                      )}

                      {isFinalized && (
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-status-finalized" />
                          <span className="text-xs text-status-finalized font-medium">OFFICIAL</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedMatch(match); setIsReopenOpen(true); }}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Reopen
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No matches to review</h3>
            <p className="text-muted-foreground">Completed matches will appear here for finalization</p>
          </div>
        )}
      </div>

      {/* Finalize Dialog */}
      <Dialog open={isFinalizeOpen} onOpenChange={setIsFinalizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Match Score</DialogTitle>
            <DialogDescription>
              This will mark the score as official. Only you can reopen it for corrections.
            </DialogDescription>
          </DialogHeader>
          {selectedMatch && (
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">Final Score</p>
              <div className="flex items-center justify-center gap-4">
                <div>
                  <p className="font-semibold">{selectedMatch.team_a?.name}</p>
                  <p className="text-3xl font-display font-bold">
                    {selectedMatch.scores?.find(s => s.team_id === selectedMatch.team_a_id)?.score_value ?? 0}
                  </p>
                </div>
                <span className="text-xl text-muted-foreground">-</span>
                <div>
                  <p className="font-semibold">{selectedMatch.team_b?.name}</p>
                  <p className="text-3xl font-display font-bold">
                    {selectedMatch.scores?.find(s => s.team_id === selectedMatch.team_b_id)?.score_value ?? 0}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFinalizeOpen(false)}>Cancel</Button>
            <Button onClick={handleFinalize}>
              <Shield className="h-4 w-4 mr-2" />
              Finalize Score
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Dialog */}
      <Dialog open={isReopenOpen} onOpenChange={setIsReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-status-provisional" />
              Reopen Match for Correction
            </DialogTitle>
            <DialogDescription>
              A reason is mandatory. This will be logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for reopening *</Label>
              <Textarea
                placeholder="e.g. Scoring error in the 3rd quarter"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReopenOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReopen} disabled={!reopenReason.trim()}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reopen Match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
