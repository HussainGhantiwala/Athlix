import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Play, Square, Edit2, Target, Clock, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Match } from '@/types/database';
import { tryCreateNextRoundMatch, updateStandingsAfterMatch } from '@/lib/tournament-engine';
import { detectSportKey, getRulesForSport, resolveMatchOutcome, getInitialPhase, getResetFields, requiresToss, usesCricketEngine } from '@/config/sportRules';
import SportScoreDialog from './SportScoreDialog';
import TossModal from './TossModal';

const KNOCKOUT_ROUNDS = new Set(['round_of_16', 'quarterfinal', 'semifinal', 'final']);

export default function ScoreControlPanel() {
  const { user, universityId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>([]);
  const [completedMatches, setCompletedMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [tossMatch, setTossMatch] = useState<Match | null>(null);
  const [isTossModalOpen, setIsTossModalOpen] = useState(false);
  const [autoOpenHandled, setAutoOpenHandled] = useState(false);

  // Debounce realtime refreshes to avoid flooding
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetch = useCallback(() => {
    if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
    realtimeTimer.current = setTimeout(() => fetchMatches(), 500);
  }, []);

  useEffect(() => {
    fetchMatches();
    const channel = supabase
      .channel('score-control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        const d = payload.new as any;
        if (!d) {
          debouncedFetch();
          return;
        }
        // Update live matches in-place for instant UI (optimistic from realtime)
        setLiveMatches(prev => prev.map(m => m.id === d.id ? { ...m, ...d } as Match : m));
        // Also update the selected match if it's the one being updated (keeps dialog in sync)
        setSelectedMatch(prev => prev && prev.id === d.id ? { ...prev, ...d } as Match : prev);
        // Only do a full refetch when status changes (match started/ended)
        if (['live', 'completed', 'scheduled'].includes(d.status)) {
          debouncedFetch();
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
    };
  }, [debouncedFetch]);

  // Auto-open scoring dialog from ?match= query param
  useEffect(() => {
    if (loading || autoOpenHandled) return;
    const matchId = searchParams.get('match');
    if (!matchId) return;
    const targetMatch = liveMatches.find(m => m.id === matchId);
    if (targetMatch) {
      setSelectedMatch(targetMatch);
      setIsScoreDialogOpen(true);
      setAutoOpenHandled(true);
      setSearchParams({}, { replace: true });
    }
  }, [loading, liveMatches, searchParams, autoOpenHandled, setSearchParams]);

  const matchSelect = `
    *, team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
    team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
    venue:venues(name),
    event_sport:event_sports(sport_category:sports_categories(name, icon), event:events(name, tournament_type, status))
  `;

  const fetchMatches = async () => {
    setLoading(true);
    const [liveRes, scheduledRes, completedRes] = await Promise.all([
      supabase.from('matches').select(matchSelect).eq('status', 'live').order('started_at', { ascending: false }),
      supabase.from('matches').select(matchSelect).eq('status', 'scheduled').or('is_placeholder.is.null,is_placeholder.eq.false').order('scheduled_at').limit(20),
      supabase.from('matches').select(matchSelect).eq('status', 'completed').order('completed_at', { ascending: false }).limit(10),
    ]);
    if (liveRes.error || scheduledRes.error || completedRes.error) {
      toast.error(
        liveRes.error?.message ||
        scheduledRes.error?.message ||
        completedRes.error?.message ||
        'Failed to load matches'
      );
    }
    setLiveMatches((liveRes.data as unknown as Match[]) || []);
    setScheduledMatches((scheduledRes.data as unknown as Match[]) || []);
    setCompletedMatches((completedRes.data as unknown as Match[]) || []);
    setLoading(false);
  };

  // Get sport name from match
  const getSportName = (match: Match) => ((match.event_sport as any)?.sport_category?.name || '');

  // Start match â€” check sport rules for toss requirement
  const handleStartMatchClick = (match: Match) => {
    if (requiresToss(getSportName(match))) {
      setTossMatch(match);
      setIsTossModalOpen(true);
    } else {
      handleStartMatch(match);
    }
  };

  // Start match with optional toss data
  const handleStartMatch = async (match: Match, tossData?: { tossWinnerId: string; tossDecision: string; battingTeamId: string; bowlingTeamId: string }) => {
    const sportName = getSportName(match);
    const initialPhase = getInitialPhase(sportName);
    const resetFields = getResetFields(sportName);

    const updatePayload: any = {
      status: 'live',
      started_at: new Date().toISOString(),
      current_editor_id: user?.id,
      editor_locked_at: new Date().toISOString(),
      match_phase: initialPhase,
      ...resetFields,
    };

    if (tossData) {
      updatePayload.toss_winner_id = tossData.tossWinnerId;
      updatePayload.toss_decision = tossData.tossDecision;
      updatePayload.batting_team_id = tossData.battingTeamId;
      updatePayload.bowling_team_id = tossData.bowlingTeamId;
    }

    const { error } = await supabase.from('matches').update(updatePayload).eq('id', match.id);
    if (error) { toast.error('Failed to start match'); return; }

    toast.success('Match started â€” LIVE!');
    fetchMatches();
  };

  // Toss confirmed â†’ start cricket match
  const handleTossConfirm = async (tossWinnerId: string, tossDecision: 'bat' | 'bowl', battingTeamId: string, bowlingTeamId: string) => {
    if (!tossMatch) return;
    setIsTossModalOpen(false);
    await handleStartMatch(tossMatch, { tossWinnerId, tossDecision, battingTeamId, bowlingTeamId });
    setTossMatch(null);
  };

  const handleOpenScore = async (match: Match) => {
    // Always fetch fresh match data from DB to avoid stale state
    const { data } = await supabase.from('matches').select(matchSelect).eq('id', match.id).single();
    setSelectedMatch((data as unknown as Match) ?? match);
    setIsScoreDialogOpen(true);
  };

  const handleEndMatch = async (match: Match) => {
    if ((match.status as any) === 'completed' || (match as any).match_phase === 'completed') return;

    const sportName = getSportName(match);
    const isCricket = usesCricketEngine(sportName);
    const scoreA = isCricket ? (match.runs_a ?? 0) : (match.score_a ?? 0);
    const scoreB = isCricket ? (match.runs_b ?? 0) : (match.score_b ?? 0);

    // Use sport rules engine to determine outcome
    const outcome = resolveMatchOutcome(sportName, scoreA, scoreB);

    // If the outcome is a tie-breaker phase (penalties, super_over, overtime), transition to it
    if (outcome !== 'completed') {
      await supabase.from('matches').update({ match_phase: outcome } as any).eq('id', match.id);
      const labels: Record<string, string> = {
        penalties: 'Scores tied! Penalty shootout required.',
        super_over: 'Scores tied! Super over required.',
        overtime: 'Scores tied! Overtime required.',
      };
      toast.info(labels[outcome] || 'Tie-breaker required.');
      fetchMatches();
      return;
    }

    const round = String(match.round || '').toLowerCase();
    const isKnockout = KNOCKOUT_ROUNDS.has(round);
    const winnerId = scoreA > scoreB ? match.team_a_id : scoreB > scoreA ? match.team_b_id : null;
    const resultStatus = 'final';

    // For cricket, re-fetch latest scores from DB before ending
    let finalScoreA = scoreA;
    let finalScoreB = scoreB;
    let finalWinnerId = winnerId;
    if (isCricket) {
      const { data: freshMatch } = await supabase.from('matches').select('runs_a,runs_b,wickets_a,wickets_b,balls_a,balls_b,target_score,innings').eq('id', match.id).single();
      if (freshMatch) {
        finalScoreA = freshMatch.runs_a ?? 0;
        finalScoreB = freshMatch.runs_b ?? 0;
        finalWinnerId = finalScoreA > finalScoreB ? match.team_a_id : finalScoreB > finalScoreA ? match.team_b_id : null;
        // Completed matches are now final immediately.
      }
    }

    const { error } = await supabase
      .from('matches')
      .update({
        status: 'completed' as any,
        completed_at: new Date().toISOString(),
        current_editor_id: null,
        editor_locked_at: null,
        score_a: finalScoreA,
        score_b: finalScoreB,
        winner_id: finalWinnerId || undefined,
        winner_team_id: finalWinnerId || undefined,
        result_status: resultStatus,
        phase: 'finished',
        match_phase: 'completed',
      } as any)
      .eq('id', match.id);

    if (error) { toast.error('Failed to end match: ' + error.message); return; }

    // Build result summary
    const teamAName = (match.team_a as any)?.name || 'Team A';
    const teamBName = (match.team_b as any)?.name || 'Team B';
    let resultMsg = 'Match completed!';
    if (isCricket && finalWinnerId) {
      if (finalWinnerId === match.team_a_id) {
        resultMsg = `${teamAName} won by ${finalScoreA - finalScoreB} runs`;
      } else {
        resultMsg = `${teamBName} won by ${10 - (match.wickets_b ?? 0)} wickets`;
      }
    } else if (finalWinnerId) {
      const winnerName = finalWinnerId === match.team_a_id ? teamAName : teamBName;
      resultMsg = `${winnerName} won!`;
    }

    if (isKnockout && finalWinnerId && universityId) {
      const nextMatchId = await tryCreateNextRoundMatch(
        match.id,
        match.event_sport_id,
        user?.id || '',
        match.scheduled_at,
        universityId
      );
      toast.success(nextMatchId ? `${resultMsg} â€” Winner advanced to next round!` : `${resultMsg} â€” Waiting for other matches.`);
    } else if (round === 'group_stage' && match.team_a_id && match.team_b_id) {
      await updateStandingsAfterMatch(match.id, match.event_sport_id, match.team_a_id, match.team_b_id, finalScoreA, finalScoreB);
      toast.success(`${resultMsg} â€” Standings updated!`);
    } else {
      toast.success(resultMsg);
    }
    fetchMatches();
  };

  const MatchContext = ({ match }: { match: Match }) => (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xl">{match.event_sport?.sport_category?.icon}</span>
      <div>
        <span className="font-medium text-sm">{match.event_sport?.sport_category?.name}</span>
        <p className="text-xs text-muted-foreground">{match.event_sport?.event?.name}</p>
        <div className="flex gap-1 mt-0.5 flex-wrap">
          {match.phase && <span className="text-xs px-1 py-0.5 rounded bg-accent/10 text-accent">{match.phase}</span>}
          {match.group_name && <span className="text-xs px-1 py-0.5 rounded bg-muted text-muted-foreground">Group {match.group_name}</span>}
          {match.round && <span className="text-xs text-muted-foreground">{match.round}</span>}
        </div>
      </div>
    </div>
  );

  // Enhanced score display with toss info + run rates
  const ScoreDisplay = ({ match }: { match: Match }) => {
    const sportName = (match.event_sport as any)?.sport_category?.name?.toLowerCase() || '';
    const isCricket = sportName.includes('cricket');
    const isFootball = sportName.includes('football') || sportName.includes('soccer');
    const scoreA = match.score_a ?? 0;
    const scoreB = match.score_b ?? 0;
    const phase = (match as any).match_phase || '';
    const tossWinnerId = (match as any).toss_winner_id;
    const tossDecision = (match as any).toss_decision;

    if (isCricket) {
      const runsA = match.runs_a ?? 0;
      const wicketsA = match.wickets_a ?? 0;
      const ballsA = match.balls_a ?? 0;
      const runsB = match.runs_b ?? 0;
      const wicketsB = match.wickets_b ?? 0;
      const ballsB = match.balls_b ?? 0;
      const innings = match.innings ?? (phase === 'second_innings' ? 2 : 1);
      const target = match.target_score ?? null;
      const teamAName = (match.team_a as any)?.name;
      const teamBName = (match.team_b as any)?.name;
      const tossWinnerName = tossWinnerId === match.team_a_id ? teamAName : tossWinnerId === match.team_b_id ? teamBName : null;

      const activeRuns = innings === 2 ? runsB : runsA;
      const activeBalls = innings === 2 ? ballsB : ballsA;
      const rr = activeBalls > 0 ? (activeRuns / (activeBalls / 6)).toFixed(2) : '0.00';
      const rrr = innings === 2 && target
        ? (() => {
            const need = target - runsB;
            const ballsLeft = 120 - ballsB;
            return ballsLeft > 0 ? (need / (ballsLeft / 6)).toFixed(2) : 'âˆž';
          })()
        : null;

      return (
        <div className="mb-4">
          {tossWinnerName && (
            <p className="text-center text-xs text-muted-foreground mb-2">
              👉 {tossWinnerName} won toss – <span className="capitalize">{tossDecision}</span> first
            </p>
          )}
          {target && innings === 2 && (
            <div className="text-center p-2 mb-3 rounded bg-accent/10 text-accent text-sm font-medium">
              Target: {target} | Need {Math.max(0, target - runsB)} runs
            </div>
          )}
          {phase && phase !== 'not_started' && (
            <p className="text-center text-xs text-muted-foreground mb-2 capitalize">{phase.replace(/_/g, ' ')}</p>
          )}
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="font-bold">{teamAName}</p>
              <p className="text-xs text-muted-foreground">{(match.team_a as any)?.university?.short_name}</p>
              <p className="text-3xl font-display font-bold mt-2">{runsA}/{wicketsA}</p>
              <p className="text-xs text-muted-foreground">{Math.floor(ballsA / 6)}.{ballsA % 6} ov</p>
            </div>
            <span className="text-2xl text-muted-foreground px-4">vs</span>
            <div className="text-center flex-1">
              <p className="font-bold">{teamBName}</p>
              <p className="text-xs text-muted-foreground">{(match.team_b as any)?.university?.short_name}</p>
              <p className="text-3xl font-display font-bold mt-2">{runsB}/{wicketsB}</p>
              <p className="text-xs text-muted-foreground">{Math.floor(ballsB / 6)}.{ballsB % 6} ov</p>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>RR: {rr}</span>
            {rrr && <span>RRR: {rrr}</span>}
          </div>
        </div>
      );
    }

    if (isFootball) {
      return (
        <div className="mb-4">
          {phase && phase !== 'not_started' && (
            <p className="text-center text-sm font-medium mb-2">
              <span className="capitalize">{phase.replace(/_/g, ' ')}</span>
            </p>
          )}
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="font-bold">{(match.team_a as any)?.name}</p>
              <p className="text-xs text-muted-foreground">{(match.team_a as any)?.university?.short_name}</p>
              <p className="text-4xl font-display font-bold mt-2">{scoreA}</p>
            </div>
            <span className="text-2xl text-muted-foreground px-4">vs</span>
            <div className="text-center flex-1">
              <p className="font-bold">{(match.team_b as any)?.name}</p>
              <p className="text-xs text-muted-foreground">{(match.team_b as any)?.university?.short_name}</p>
              <p className="text-4xl font-display font-bold mt-2">{scoreB}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between mb-4">
        <div className="text-center flex-1">
          <p className="font-bold">{(match.team_a as any)?.name}</p>
          <p className="text-xs text-muted-foreground">{(match.team_a as any)?.university?.short_name}</p>
          <p className="text-4xl font-display font-bold mt-2">{scoreA}</p>
        </div>
        <span className="text-2xl text-muted-foreground px-4">vs</span>
        <div className="text-center flex-1">
          <p className="font-bold">{(match.team_b as any)?.name}</p>
          <p className="text-xs text-muted-foreground">{(match.team_b as any)?.university?.short_name}</p>
          <p className="text-4xl font-display font-bold mt-2">{scoreB}</p>
        </div>
      </div>
    );
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
              {liveMatches.map(match => (
                <div key={match.id} className="dashboard-card border-2 border-status-live p-5">
                  <div className="flex items-center justify-between mb-4">
                    <MatchContext match={match} />
                    <StatusBadge status="live" />
                  </div>
                  <ScoreDisplay match={match} />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => handleOpenScore(match)}>
                      <Edit2 className="h-4 w-4 mr-2" />
                      Live Score
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => handleEndMatch(match)}>
                      <Square className="h-4 w-4 mr-2" />
                      End Match
                    </Button>
                  </div>
                </div>
              ))}
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
            Scheduled Matches ({scheduledMatches.length})
          </h2>

          {scheduledMatches.length > 0 ? (
            <div className="space-y-3">
              {scheduledMatches.map(match => (
                <div key={match.id} className="dashboard-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <MatchContext match={match} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">
                      {(match.team_a as any)?.name || 'TBD'} vs {(match.team_b as any)?.name || 'TBD'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(match.scheduled_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                  {match.venue && <p className="text-sm text-muted-foreground">ðŸ“ {(match.venue as any).name}</p>}
                  <StatusBadge status="scheduled" />
                  {match.team_a_id && match.team_b_id && (
                    <Button onClick={() => handleStartMatchClick(match)}>
                      <Play className="h-4 w-4 mr-2" />
                      Start Match
                    </Button>
                  )}
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

        {/* Recent Results */}
        {completedMatches.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <Trophy className="h-5 w-5 text-accent" />
              Recent Results
            </h2>
            <div className="space-y-3">
              {completedMatches.map(match => {
                const scoreA = match.score_a ?? 0;
                const scoreB = match.score_b ?? 0;
                const winnerName = match.winner_team_id === match.team_a_id ? (match.team_a as any)?.name
                  : match.winner_team_id === match.team_b_id ? (match.team_b as any)?.name : null;
                return (
                  <div key={match.id} className="dashboard-card p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <MatchContext match={match} />
                      <div className="flex items-center gap-3 flex-1 justify-center">
                        <div className="text-right">
                          <p className={cn('font-semibold', match.winner_team_id === match.team_a_id && 'text-accent')}>
                            {(match.team_a as any)?.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-2xl font-display font-bold', scoreA > scoreB && 'text-accent')}>{scoreA}</span>
                          <span className="text-muted-foreground">-</span>
                          <span className={cn('text-2xl font-display font-bold', scoreB > scoreA && 'text-accent')}>{scoreB}</span>
                        </div>
                        <div className="text-left">
                          <p className={cn('font-semibold', match.winner_team_id === match.team_b_id && 'text-accent')}>
                            {(match.team_b as any)?.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={match.status} />
                        {winnerName && <span className="text-xs font-semibold text-accent">ðŸ† {winnerName}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Score Dialog */}
      <SportScoreDialog
        open={isScoreDialogOpen}
        onOpenChange={setIsScoreDialogOpen}
        match={selectedMatch}
        userId={user?.id}
        onUpdated={async () => {
          // Check if the match was auto-completed by the RPC
          if (selectedMatch) {
            const { data: freshMatch } = await supabase
              .from('matches')
              .select('status,match_phase,winner_team_id,round,event_sport_id,team_a_id,team_b_id,runs_a,runs_b,score_a,score_b,scheduled_at')
              .eq('id', selectedMatch.id)
              .single();
            if (freshMatch && freshMatch.status === 'completed' && freshMatch.match_phase === 'completed' && freshMatch.winner_team_id) {
              // Trigger bracket progression
              if (KNOCKOUT_ROUNDS.has(String(freshMatch.round || '').toLowerCase()) && universityId) {
                await tryCreateNextRoundMatch(
                  selectedMatch.id,
                  freshMatch.event_sport_id,
                  user?.id || '',
                  freshMatch.scheduled_at,
                  universityId
                );
              } else if (String(freshMatch.round || '').toLowerCase() === 'group_stage' && freshMatch.team_a_id && freshMatch.team_b_id) {
                await updateStandingsAfterMatch(
                  selectedMatch.id,
                  freshMatch.event_sport_id,
                  freshMatch.team_a_id,
                  freshMatch.team_b_id,
                  freshMatch.score_a ?? freshMatch.runs_a ?? 0,
                  freshMatch.score_b ?? freshMatch.runs_b ?? 0
                );
              }
            }
          }
          fetchMatches();
        }}
        onEndMatch={(m) => { setIsScoreDialogOpen(false); handleEndMatch(m); }}
      />

      {/* Toss Modal */}
      {tossMatch && (
        <TossModal
          open={isTossModalOpen}
          onOpenChange={setIsTossModalOpen}
          teamAName={(tossMatch.team_a as any)?.name || 'Team A'}
          teamBName={(tossMatch.team_b as any)?.name || 'Team B'}
          teamAId={tossMatch.team_a_id!}
          teamBId={tossMatch.team_b_id!}
          onConfirm={handleTossConfirm}
        />
      )}
    </DashboardLayout>
  );
}
