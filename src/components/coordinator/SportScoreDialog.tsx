import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Plus, Minus, ArrowRight, Square, Trophy } from 'lucide-react';
import { Match } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { tryCreateNextRoundMatch, updateStandingsAfterMatch } from '@/lib/tournament-engine';
import { detectSportKey, resolveMatchOutcome, usesCricketEngine, type SportKey } from '@/config/sportRules';

const KNOCKOUT_ROUNDS = new Set(['round_of_16', 'quarterfinal', 'semifinal', 'final']);

interface SportScoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: Match | null;
  userId?: string;
  onUpdated: () => void;
  onEndMatch?: (match: Match) => void;
}

type SportType = 'cricket' | 'football' | 'badminton' | 'basketball' | 'generic';

type CricketAction = 'dot' | 'run_1' | 'run_2' | 'run_4' | 'run_6' | 'wicket' | 'wide' | 'no_ball';

interface CricketState {
  runsA: number;
  wicketsA: number;
  ballsA: number;
  runsB: number;
  wicketsB: number;
  ballsB: number;
  innings: 1 | 2;
  target: number | null;
}

function detectSportType(sportName?: string): SportType {
  const key = detectSportKey(sportName);
  if (key === 'cricket') return 'cricket';
  if (key === 'football' || key === 'futsal' || key === 'hockey') return 'football';
  if (key === 'badminton' || key === 'table_tennis' || key === 'tennis') return 'badminton';
  if (key === 'basketball') return 'basketball';
  return 'generic';
}

function ballsToOvers(balls: number) {
  return `${Math.floor((balls || 0) / 6)}.${(balls || 0) % 6}`;
}

function runRate(runs: number, balls: number) {
  if (!balls) return '0.00';
  return (runs / (balls / 6)).toFixed(2);
}

export default function SportScoreDialog({ open, onOpenChange, match, userId, onUpdated, onEndMatch }: SportScoreDialogProps) {
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [footballMinute, setFootballMinute] = useState(0);
  const [matchPhase, setMatchPhase] = useState<string>('not_started');
  const [matchStatus, setMatchStatus] = useState<string>('scheduled');
  const [updating, setUpdating] = useState(false);
  const [cricketState, setCricketState] = useState<CricketState>({
    runsA: 0, wicketsA: 0, ballsA: 0,
    runsB: 0, wicketsB: 0, ballsB: 0,
    innings: 1, target: null,
  });
  const [penaltyA, setPenaltyA] = useState(0);
  const [penaltyB, setPenaltyB] = useState(0);
  const completionNotifiedRef = useRef(false);

  const isCompletedMatch = useCallback((status?: string | null, phase?: string | null) => {
    return status === 'completed' || status === 'completed_provisional' || status === 'finalized' || phase === 'completed';
  }, []);

  const sportName = (match?.event_sport as any)?.sport_category?.name;
  const sportType = detectSportType(sportName);
  const isMatchCompleted = isCompletedMatch(matchStatus, matchPhase);

  useEffect(() => {
    if (!match) return;
    setMatchStatus(match.status || 'scheduled');
    completionNotifiedRef.current = isCompletedMatch(match.status, (match as any).match_phase);
  }, [match?.id, match?.status, (match as any)?.match_phase, isCompletedMatch]);

  // --- Cricket snapshot fetch ---
  const fetchCricketSnapshot = useCallback(async () => {
    if (!match?.id) return;
    const { data, error } = await supabase
      .from('matches')
      .select('runs_a,wickets_a,balls_a,runs_b,wickets_b,balls_b,innings,target_score,match_phase,status,winner_team_id')
      .eq('id', match.id)
      .single();
    if (error || !data) return;
    setCricketState({
      runsA: data.runs_a ?? 0, wicketsA: data.wickets_a ?? 0, ballsA: data.balls_a ?? 0,
      runsB: data.runs_b ?? 0, wicketsB: data.wickets_b ?? 0, ballsB: data.balls_b ?? 0,
      innings: ((data.innings ?? 1) === 2 ? 2 : 1),
      target: data.target_score ?? null,
    });
    setMatchPhase(data.match_phase || 'not_started');
    setMatchStatus(data.status || 'scheduled');
  }, [match?.id]);

  // --- Initial load: always fetch fresh from DB ---
  useEffect(() => {
    if (!match || !open) return;
    if (sportType === 'cricket') {
      fetchCricketSnapshot();
      return;
    }
    // For non-cricket, fetch fresh score snapshot from matches
    (async () => {
      const { data } = await supabase
        .from('matches')
        .select('match_phase, status, penalty_a, penalty_b, score_a, score_b')
        .eq('id', match.id)
        .single();
      if (data) {
        setMatchPhase(data.match_phase || 'not_started');
        setMatchStatus((data as any).status || 'scheduled');
        setPenaltyA((data as any).penalty_a ?? 0);
        setPenaltyB((data as any).penalty_b ?? 0);
        setScoreA((data as any).score_a ?? 0);
        setScoreB((data as any).score_b ?? 0);
      }
    })();
  }, [match?.id, open, sportType, fetchCricketSnapshot]);

  // --- Realtime subscription for ALL sport types ---
  useEffect(() => {
    if (!match?.id || !open) return;

    const channel = supabase
      .channel(`score-dialog-${match.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` },
        (payload) => {
          const d = payload.new as any;
          // Update match phase from realtime
          if (d.match_phase) setMatchPhase(d.match_phase);
          if (d.status) setMatchStatus(d.status);

          if (sportType === 'cricket') {
            setCricketState({
              runsA: d.runs_a ?? 0, wicketsA: d.wickets_a ?? 0, ballsA: d.balls_a ?? 0,
              runsB: d.runs_b ?? 0, wicketsB: d.wickets_b ?? 0, ballsB: d.balls_b ?? 0,
              innings: ((d.innings ?? 1) === 2 ? 2 : 1),
              target: d.target_score ?? null,
            });
            if (
              d.innings === 2 &&
              d.target_score != null &&
              (d.runs_b ?? 0) >= d.target_score &&
              d.status !== 'completed' &&
              !completionNotifiedRef.current
            ) {
              completionNotifiedRef.current = true;
              const winnerTeamId = match?.team_b_id;
              if (winnerTeamId) {
                void (async () => {
                  const isKnockout = KNOCKOUT_ROUNDS.has(String(match?.round || '').toLowerCase());
                  const { error } = await supabase.from('matches').update({
                    status: 'completed' as any,
                    phase: 'finished',
                    match_phase: 'completed',
                    completed_at: new Date().toISOString(),
                    winner_id: winnerTeamId,
                    winner_team_id: winnerTeamId,
                    result_status: isKnockout ? 'advanced' : 'completed',
                    score_a: d.runs_a ?? 0,
                    score_b: d.runs_b ?? 0,
                    current_editor_id: null,
                    editor_locked_at: null,
                  } as any).eq('id', match.id);
                  if (error) {
                    toast.error(error.message || 'Failed to complete match');
                    return;
                  }
                  setMatchStatus('completed');
                  setMatchPhase('completed');
                  onUpdated();
                })();
              }
              return;
            }
            if (isCompletedMatch(d.status, d.match_phase)) {
              completionNotifiedRef.current = true;
              return;
            }
          } else {
            // For football/generic, update score and penalties from realtime
            if (d.score_a != null) setScoreA(d.score_a);
            if (d.score_b != null) setScoreB(d.score_b);
            if (d.penalty_a != null) setPenaltyA(d.penalty_a);
            if (d.penalty_b != null) setPenaltyB(d.penalty_b);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [match?.id, match?.round, match?.team_a_id, match?.team_b_id, open, sportType, isCompletedMatch, onUpdated]);

  // --- Cricket debounced action ---
  const cricketActionQueue = useRef<CricketAction | null>(null);
  const cricketDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeCricketAction = useCallback(async (action: CricketAction) => {
    if (!match?.id || isMatchCompleted) return;
    setUpdating(true);
    const { data, error } = await supabase.rpc('apply_cricket_score_action' as any, {
      _match_id: match.id, _action: action,
    } as any);
    if (error) {
      toast.error(error.message || 'Failed to update score');
      setUpdating(false);
      return;
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.out_match_phase === 'completed') {
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onUpdated();
      }
      const winnerTeamId = match.team_b_id;
      if (winnerTeamId && matchStatus !== 'completed') {
        const isKnockout = KNOCKOUT_ROUNDS.has(String(match.round || '').toLowerCase());
        const { error: completeError } = await supabase.from('matches').update({
          status: 'completed' as any,
          phase: 'finished',
          match_phase: 'completed',
          completed_at: new Date().toISOString(),
          winner_id: winnerTeamId,
          winner_team_id: winnerTeamId,
          result_status: isKnockout ? 'advanced' : 'completed',
          current_editor_id: null,
          editor_locked_at: null,
        } as any).eq('id', match.id).neq('status', 'completed');
        if (completeError) {
          toast.error(completeError.message || 'Failed to complete match');
        }
      }
      setMatchStatus('completed');
      setMatchPhase('completed');
      toast.success('Target chased! Match completed automatically.');
    }
    // Realtime will update local state; no need for fetchCricketSnapshot or onUpdated
    setUpdating(false);
  }, [match?.id, match?.round, match?.team_b_id, isMatchCompleted, matchStatus, onUpdated]);

  const handleCricketAction = useCallback(async (action: CricketAction) => {
    if (isMatchCompleted) return;
    // Optimistic local update for instant feedback
    setCricketState(prev => {
      const isFirst = prev.innings === 1;
      let runInc = 0, ballInc = 0, wicketInc = 0;
      switch (action) {
        case 'dot': ballInc = 1; break;
        case 'run_1': runInc = 1; ballInc = 1; break;
        case 'run_2': runInc = 2; ballInc = 1; break;
        case 'run_4': runInc = 4; ballInc = 1; break;
        case 'run_6': runInc = 6; ballInc = 1; break;
        case 'wicket': wicketInc = 1; ballInc = 1; break;
        case 'wide': runInc = 1; break;
        case 'no_ball': runInc = 1; break;
      }
      if (isFirst) {
        return { ...prev, runsA: prev.runsA + runInc, wicketsA: Math.min(10, prev.wicketsA + wicketInc), ballsA: prev.ballsA + ballInc };
      }
      return { ...prev, runsB: prev.runsB + runInc, wicketsB: Math.min(10, prev.wicketsB + wicketInc), ballsB: prev.ballsB + ballInc };
    });

    if (cricketDebounceTimer.current) clearTimeout(cricketDebounceTimer.current);
    cricketActionQueue.current = action;
    cricketDebounceTimer.current = setTimeout(() => {
      if (cricketActionQueue.current) {
        executeCricketAction(cricketActionQueue.current);
        cricketActionQueue.current = null;
      }
    }, 150);
  }, [executeCricketAction, isMatchCompleted]);

  const handleEndFirstInnings = async () => {
    if (!match?.id) return;
    setUpdating(true);
    const target = (cricketState.runsA ?? 0) + 1;
    const { error } = await supabase.from('matches').update({
      target_score: target, innings: 2, match_phase: 'innings_break',
    } as any).eq('id', match.id);
    if (error) { toast.error('Failed to end first innings'); setUpdating(false); return; }
    // Optimistic update
    setMatchPhase('innings_break');
    setCricketState(prev => ({ ...prev, target, innings: 2 }));
    toast.success(`First innings complete. Target: ${target}`);
    setUpdating(false);
  };

  const handleStartSecondInnings = async () => {
    if (!match?.id) return;
    setUpdating(true);
    const { error } = await supabase.from('matches').update({
      innings: 2, match_phase: 'second_innings',
    } as any).eq('id', match.id);
    if (error) { toast.error('Failed to start second innings'); setUpdating(false); return; }
    setMatchPhase('second_innings');
    toast.success('Second innings started');
    setUpdating(false);
  };

  // --- Football/generic: save individual team score (optimistic) ---
  const saveTeamScoreDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveTeamScore = useCallback(async (teamId: string, newScore: number) => {
    if (!match?.id) return;
    const isTeamA = !!match.team_a_id && teamId === match.team_a_id;
    const patch = isTeamA ? { score_a: newScore } : { score_b: newScore };
    await supabase.from('matches').update(patch as any).eq('id', match.id);
    // No onUpdated â€” realtime handles sync
  }, [match?.id, match?.team_a_id]);

  const handleScoreChangeA = useCallback((val: number) => {
    setScoreA(val); // Optimistic
    if (saveTeamScoreDebounce.current) clearTimeout(saveTeamScoreDebounce.current);
    saveTeamScoreDebounce.current = setTimeout(() => {
      if (match?.team_a_id) saveTeamScore(match.team_a_id, val);
    }, 200);
  }, [match?.team_a_id, saveTeamScore]);

  const handleScoreChangeB = useCallback((val: number) => {
    setScoreB(val); // Optimistic
    if (saveTeamScoreDebounce.current) clearTimeout(saveTeamScoreDebounce.current);
    saveTeamScoreDebounce.current = setTimeout(() => {
      if (match?.team_b_id) saveTeamScore(match.team_b_id, val);
    }, 200);
  }, [match?.team_b_id, saveTeamScore]);

  const saveNonCricketScore = useCallback(async (newA: number, newB: number) => {
    if (!match?.id) return;
    await supabase
      .from('matches')
      .update({ score_a: newA, score_b: newB } as any)
      .eq('id', match.id);
  }, [match?.id]);

  // --- Football phase handlers (optimistic) ---
  const handleHalfTime = async () => {
    if (!match) return;
    setUpdating(true);
    setMatchPhase('halftime'); // Optimistic
    await saveNonCricketScore(scoreA, scoreB);
    await supabase.from('matches').update({ match_phase: 'halftime' } as any).eq('id', match.id);
    toast.success('Half time!');
    setUpdating(false);
  };

  const handleStartSecondHalf = async () => {
    if (!match) return;
    setUpdating(true);
    setMatchPhase('second_half'); // Optimistic
    setFootballMinute(45);
    await supabase.from('matches').update({ match_phase: 'second_half' } as any).eq('id', match.id);
    toast.success('Second half started!');
    setUpdating(false);
  };

  const handleFootballEndMatch = async () => {
    if (!match) return;
    await saveNonCricketScore(scoreA, scoreB);
    // Use sport rules engine to determine outcome
    const outcome = resolveMatchOutcome(sportName, scoreA, scoreB);
    if (outcome !== 'completed' && outcome !== 'none') {
      setMatchPhase(outcome); // Optimistic
      await supabase.from('matches').update({ match_phase: outcome } as any).eq('id', match.id);
      const labels: Record<string, string> = {
        penalties: 'Scores tied! Penalty shootout required.',
        super_over: 'Scores tied! Super over required.',
        overtime: 'Scores tied! Overtime required.',
      };
      toast.info(labels[outcome] || 'Tie-breaker required.');
      return;
    }
    // Clear winner â€” end the match via parent
    if (onEndMatch) onEndMatch({ ...match, score_a: scoreA, score_b: scoreB } as Match);
  };

  const handleFinishPenalties = async () => {
    if (!match || penaltyA === penaltyB) {
      toast.error('Penalty scores cannot be tied');
      return;
    }
    setUpdating(true);
    await supabase.from('matches').update({ penalty_a: penaltyA, penalty_b: penaltyB } as any).eq('id', match.id);
    const winnerId = penaltyA > penaltyB ? match.team_a_id : match.team_b_id;
    const tournamentRound = String(match.round || '').toLowerCase();
    const isKnockout = KNOCKOUT_ROUNDS.has(tournamentRound);

    await supabase.from('matches').update({
      status: 'completed' as any,
      completed_at: new Date().toISOString(),
      current_editor_id: null, editor_locked_at: null,
      score_a: scoreA,
      score_b: scoreB,
      winner_id: winnerId,
      winner_team_id: winnerId,
      result_status: winnerId ? (isKnockout ? 'advanced' : 'completed') : 'draw',
      phase: 'finished',
      match_phase: 'completed',
    } as any).eq('id', match.id);

    const teamAName = (match.team_a as any)?.name || 'Team A';
    const teamBName = (match.team_b as any)?.name || 'Team B';
    const winnerName = penaltyA > penaltyB ? teamAName : teamBName;
    toast.success(`${winnerName} wins on penalties (${penaltyA}-${penaltyB})!`);

    // Advance winner in knockout brackets
    if (isKnockout && winnerId) {
      await tryCreateNextRoundMatch(match.id, match.event_sport_id, userId || '', match.scheduled_at);
    }
    // Update standings for group/league
    if (tournamentRound === 'group_stage' && winnerId && match.team_a_id && match.team_b_id) {
      await updateStandingsAfterMatch(match.id, match.event_sport_id, match.team_a_id, match.team_b_id, scoreA, scoreB);
    }
    setMatchStatus('completed');
    setMatchPhase('completed');
    onOpenChange(false);
    onUpdated();
    setUpdating(false);
  };

  if (!match) return null;

  const teamAName = (match.team_a as any)?.name || 'Team A';
  const teamBName = (match.team_b as any)?.name || 'Team B';
  const tossWinnerId = match.toss_winner_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Live Scoring â€” {sportName || 'Match'}</DialogTitle>
          <DialogDescription>Each scoring button updates the database instantly.</DialogDescription>
        </DialogHeader>

        {tossWinnerId && sportType === 'cricket' && (
          <div className="text-center text-xs text-muted-foreground p-2 rounded bg-muted/30 border border-border">
            ðŸª™ {tossWinnerId === match.team_a_id ? teamAName : teamBName} won toss â€” chose to <span className="capitalize font-medium">{match.toss_decision}</span> first
          </div>
        )}

        {matchPhase && matchPhase !== 'not_started' && (
          <div className="flex items-center justify-center">
            <Badge variant="outline" className="text-sm capitalize">{matchPhase.replace(/_/g, ' ')}</Badge>
          </div>
        )}

        <div className="space-y-6 py-2">
          {sportType === 'cricket' ? (
            <CricketPanel
              teamAName={teamAName}
              teamBName={teamBName}
              state={cricketState}
              matchPhase={matchPhase}
              updating={updating}
              onAction={handleCricketAction}
              onEndFirstInnings={handleEndFirstInnings}
              onStartSecondInnings={handleStartSecondInnings}
              onEndMatch={onEndMatch && match ? () => onEndMatch(match) : undefined}
            />
          ) : sportType === 'football' ? (
            <FootballPanel
              teamAName={teamAName}
              teamBName={teamBName}
              scoreA={scoreA}
              scoreB={scoreB}
              minute={footballMinute}
              setMinute={setFootballMinute}
              matchPhase={matchPhase}
              onHalfTime={handleHalfTime}
              onStartSecondHalf={handleStartSecondHalf}
              onScoreChangeA={handleScoreChangeA}
              onScoreChangeB={handleScoreChangeB}
              onEndMatch={handleFootballEndMatch}
              updating={updating}
              penaltyA={penaltyA}
              penaltyB={penaltyB}
              onPenaltyChangeA={setPenaltyA}
              onPenaltyChangeB={setPenaltyB}
              onFinishPenalties={handleFinishPenalties}
            />
          ) : sportType === 'badminton' || sportType === 'basketball' ? (
            <PointsPanel
              teamAName={teamAName}
              teamBName={teamBName}
              scoreA={scoreA}
              scoreB={scoreB}
              onScoreChange={(a, b) => { setScoreA(a); setScoreB(b); saveNonCricketScore(a, b); }}
              label="Points"
            />
          ) : (
            <GenericPanel
              teamAName={teamAName}
              teamBName={teamBName}
              scoreA={scoreA}
              scoreB={scoreB}
              onScoreChange={(a, b) => { setScoreA(a); setScoreB(b); saveNonCricketScore(a, b); }}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Sub-panels (memoized) ---

const CricketPanel = memo(function CricketPanel({
  teamAName, teamBName, state, matchPhase, updating, onAction, onEndFirstInnings, onStartSecondInnings, onEndMatch,
}: {
  teamAName: string; teamBName: string; state: CricketState; matchPhase: string; updating: boolean;
  onAction: (action: CricketAction) => Promise<void>; onEndFirstInnings: () => void; onStartSecondInnings: () => void; onEndMatch?: () => void;
}) {
  const isFirstInnings = state.innings === 1 && matchPhase !== 'completed';
  const isInningsBreak = matchPhase === 'innings_break';
  const isSecondInnings = state.innings === 2 && matchPhase === 'second_innings';
  const isCompleted = matchPhase === 'completed';

  const activeRuns = isFirstInnings ? state.runsA : state.runsB;
  const activeWickets = isFirstInnings ? state.wicketsA : state.wicketsB;
  const activeBalls = isFirstInnings ? state.ballsA : state.ballsB;
  const activeBattingName = isFirstInnings ? teamAName : teamBName;

  const rr = runRate(activeRuns, activeBalls);
  const rrr = isSecondInnings && state.target
    ? (() => {
        const need = Math.max(0, state.target - state.runsB);
        const ballsLeft = Math.max(0, 120 - state.ballsB);
        if (ballsLeft === 0) return 'âˆž';
        return (need / (ballsLeft / 6)).toFixed(2);
      })()
    : null;

  const getResultSummary = () => {
    if (state.innings !== 2 || !state.target) return null;
    if (state.runsB >= state.target) {
      const wicketsRemaining = 10 - state.wicketsB;
      const ballsRemaining = 120 - state.ballsB;
      return `${teamBName} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''} (${ballsRemaining} ball${ballsRemaining !== 1 ? 's' : ''} remaining)`;
    }
    if (isCompleted && state.runsB < (state.target - 1)) {
      const margin = (state.target - 1) - state.runsB;
      return `${teamAName} won by ${margin} run${margin !== 1 ? 's' : ''}`;
    }
    if (isCompleted && state.runsB === (state.target - 1)) return 'Match Tied';
    return null;
  };
  const resultSummary = getResultSummary();

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg border border-border bg-muted/30">
        <div className="flex justify-between items-center">
          <Label className="text-sm font-semibold">{teamAName} (1st Innings)</Label>
          {!isFirstInnings && <Badge variant="secondary" className="text-xs">Completed</Badge>}
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-display font-bold">{state.runsA}/{state.wicketsA}</span>
          <span className="text-sm text-muted-foreground">({ballsToOvers(state.ballsA)} ov)</span>
        </div>
      </div>

      {(state.target || isSecondInnings || isInningsBreak) && !isCompleted && (
        <div className="text-center p-3 rounded-lg bg-accent/10 border border-accent/20">
          <p className="text-sm text-muted-foreground">{teamBName} need</p>
          <p className="text-2xl font-display font-bold text-accent">{Math.max(0, (state.target || 0) - state.runsB)} runs</p>
          <p className="text-sm text-muted-foreground">Target: {state.target || '-'}</p>
          {rrr && <p className="text-xs text-muted-foreground mt-1">RRR: {rrr}</p>}
        </div>
      )}

      {resultSummary && (
        <div className="text-center p-4 rounded-lg bg-accent/10 border border-accent/20">
          <p className="text-lg font-display font-bold text-accent">ðŸ† {resultSummary}</p>
          {isCompleted && <p className="text-sm text-muted-foreground mt-1">Match Finished</p>}
        </div>
      )}

      {(isSecondInnings || isInningsBreak || isCompleted) && (
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <Label className="text-sm font-semibold">{teamBName} (2nd Innings)</Label>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-display font-bold">{state.runsB}/{state.wicketsB}</span>
            <span className="text-sm text-muted-foreground">({ballsToOvers(state.ballsB)} ov)</span>
          </div>
        </div>
      )}

      {!isInningsBreak && !isCompleted && (
        <div className="p-3 rounded-lg border-2 border-primary/30 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">{activeBattingName} â€” Batting</Label>
            <Badge variant="outline">{ballsToOvers(activeBalls)} ov</Badge>
          </div>
          <div className="text-center">
            <p className="text-3xl font-display font-bold">{activeRuns}/{activeWickets}</p>
            <p className="text-xs text-muted-foreground mt-1">RR: {rr}</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Button size="sm" variant="outline" className="text-base font-bold" disabled={updating} onClick={() => onAction('dot')}>0</Button>
            <Button size="sm" variant="outline" className="text-base font-bold" disabled={updating} onClick={() => onAction('run_1')}>1</Button>
            <Button size="sm" variant="outline" className="text-base font-bold" disabled={updating} onClick={() => onAction('run_2')}>2</Button>
            <Button size="sm" className="text-base font-bold bg-accent text-accent-foreground" disabled={updating} onClick={() => onAction('run_4')}>4</Button>
            <Button size="sm" className="text-base font-bold bg-accent text-accent-foreground" disabled={updating} onClick={() => onAction('run_6')}>6</Button>
            <Button size="sm" variant="destructive" className="text-base font-bold" disabled={updating} onClick={() => onAction('wicket')}>W</Button>
            <Button size="sm" variant="secondary" className="text-xs font-bold" disabled={updating} onClick={() => onAction('wide')}>Wide</Button>
            <Button size="sm" variant="secondary" className="text-xs font-bold" disabled={updating} onClick={() => onAction('no_ball')}>No Ball</Button>
          </div>
        </div>
      )}

      {isFirstInnings && (
        <Button variant="outline" className="w-full" disabled={updating} onClick={onEndFirstInnings}>
          {updating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
          End First Innings
        </Button>
      )}
      {isInningsBreak && (
        <Button className="w-full" disabled={updating} onClick={onStartSecondInnings}>
          {updating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
          Start Second Innings
        </Button>
      )}
      {isSecondInnings && !isCompleted && onEndMatch && (
        <Button variant="destructive" className="w-full" disabled={updating} onClick={onEndMatch}>
          <Square className="h-4 w-4 mr-2" /> End Match
        </Button>
      )}
    </div>
  );
});

const FootballPanel = memo(function FootballPanel({
  teamAName, teamBName, scoreA, scoreB, minute, setMinute, matchPhase, onHalfTime, onStartSecondHalf,
  onScoreChangeA, onScoreChangeB, onEndMatch, updating,
  penaltyA, penaltyB, onPenaltyChangeA, onPenaltyChangeB, onFinishPenalties,
}: {
  teamAName: string; teamBName: string; scoreA: number; scoreB: number;
  minute: number; setMinute: (v: number) => void; matchPhase: string;
  onHalfTime: () => void; onStartSecondHalf: () => void;
  onScoreChangeA: (val: number) => void; onScoreChangeB: (val: number) => void;
  onEndMatch?: () => void; updating: boolean;
  penaltyA: number; penaltyB: number;
  onPenaltyChangeA: (val: number) => void; onPenaltyChangeB: (val: number) => void;
  onFinishPenalties: () => void;
}) {
  const isHalfTime = matchPhase === 'halftime' || matchPhase === 'half_time';
  const isFirstHalf = !matchPhase || matchPhase === 'not_started' || matchPhase === 'first_half';
  const isSecondHalf = matchPhase === 'second_half';
  const isPenalties = matchPhase === 'penalties';
  const isCompleted = matchPhase === 'completed';
  const canEdit = !isHalfTime && !isCompleted && !isPenalties;

  const getResult = () => {
    if (!isCompleted) return null;
    if (penaltyA > 0 || penaltyB > 0) {
      const winnerName = penaltyA > penaltyB ? teamAName : teamBName;
      return `${winnerName} wins ${scoreA}-${scoreB} (${penaltyA}-${penaltyB} pen.)`;
    }
    if (scoreA > scoreB) return `${teamAName} win ${scoreA}-${scoreB}`;
    if (scoreB > scoreA) return `${teamBName} win ${scoreB}-${scoreA}`;
    return `Draw ${scoreA}-${scoreB}`;
  };
  const result = getResult();

  return (
    <div className="space-y-4">
      {!isCompleted && !isPenalties && (
        <div className="text-center">
          <div className="flex items-center justify-center gap-3">
            <Button size="sm" variant="outline" onClick={() => setMinute(Math.max(0, minute - 1))}><Minus className="h-3 w-3" /></Button>
            <span className="text-2xl font-display font-bold">{minute}'</span>
            <Button size="sm" variant="outline" onClick={() => setMinute(minute + 1)}><Plus className="h-3 w-3" /></Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1 capitalize">{(matchPhase || 'first_half').replace(/_/g, ' ')}</p>
        </div>
      )}

      {isHalfTime && (
        <div className="text-center p-3 rounded-lg bg-accent/10 border border-accent/20">
          <p className="text-lg font-display font-bold text-accent">HALF TIME</p>
        </div>
      )}

      {result && (
        <div className="text-center p-4 rounded-lg bg-accent/10 border border-accent/20">
          <p className="text-lg font-display font-bold text-accent">ðŸ† {result}</p>
          <p className="text-sm text-muted-foreground mt-1">Match Finished</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {[{ name: teamAName, score: scoreA, isA: true }, { name: teamBName, score: scoreB, isA: false }].map(({ name, score, isA }) => (
          <div key={name} className={`space-y-3 text-center p-3 rounded-lg border ${isHalfTime || isCompleted || isPenalties ? 'opacity-50 border-muted' : 'border-border'}`}>
            <Label className="text-base font-semibold">{name}</Label>
            <p className="text-5xl font-display font-bold">{score}</p>
            {canEdit && (
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" disabled={updating} onClick={() => isA ? onScoreChangeA(Math.max(0, score - 1)) : onScoreChangeB(Math.max(0, score - 1))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Button size="sm" disabled={updating} onClick={() => isA ? onScoreChangeA(score + 1) : onScoreChangeB(score + 1)}>
                  <Plus className="h-4 w-4 mr-1" /> Goal
                </Button>
              </div>
            )}
            {canEdit && (
              <Input
                type="number" min={0} value={score}
                onChange={(e) => { const val = parseInt(e.target.value) || 0; isA ? onScoreChangeA(val) : onScoreChangeB(val); }}
                className="text-center font-bold text-lg h-10" disabled={updating}
              />
            )}
          </div>
        ))}
      </div>

      {isPenalties && (
        <div className="space-y-4 p-4 rounded-lg border-2 border-destructive/30 bg-destructive/5">
          <p className="text-center text-lg font-display font-bold">âš½ Penalty Shootout</p>
          <div className="grid grid-cols-2 gap-6">
            {[{ name: teamAName, pen: penaltyA, isA: true }, { name: teamBName, pen: penaltyB, isA: false }].map(({ name, pen, isA }) => (
              <div key={name} className="space-y-2 text-center">
                <Label className="text-sm font-semibold">{name}</Label>
                <Input
                  type="number" min={0} value={pen}
                  onChange={(e) => { const val = parseInt(e.target.value) || 0; isA ? onPenaltyChangeA(val) : onPenaltyChangeB(val); }}
                  className="text-center font-bold text-2xl h-14" disabled={updating}
                />
              </div>
            ))}
          </div>
          <Button className="w-full" onClick={onFinishPenalties} disabled={updating || penaltyA === penaltyB}>
            {updating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trophy className="h-4 w-4 mr-2" />}
            Finish Penalties
          </Button>
          {penaltyA === penaltyB && penaltyA > 0 && (
            <p className="text-xs text-center text-destructive">Penalty scores cannot be tied</p>
          )}
        </div>
      )}

      {isFirstHalf && (
        <Button variant="outline" className="w-full" onClick={onHalfTime} disabled={updating}>
          <ArrowRight className="h-4 w-4 mr-2" /> End First Half
        </Button>
      )}
      {isHalfTime && (
        <Button className="w-full" onClick={onStartSecondHalf} disabled={updating}>
          <ArrowRight className="h-4 w-4 mr-2" /> Start Second Half
        </Button>
      )}
      {isSecondHalf && onEndMatch && (
        <Button variant="destructive" className="w-full" onClick={onEndMatch} disabled={updating}>
          <Square className="h-4 w-4 mr-2" /> End Match
        </Button>
      )}
    </div>
  );
});

function PointsPanel({
  teamAName, teamBName, scoreA, scoreB, onScoreChange, label,
}: {
  teamAName: string; teamBName: string; scoreA: number; scoreB: number;
  onScoreChange: (a: number, b: number) => void; label: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-6">
      {[{ name: teamAName, score: scoreA, isA: true }, { name: teamBName, score: scoreB, isA: false }].map(({ name, score, isA }) => (
        <div key={name} className="space-y-3 text-center p-3 rounded-lg border border-border">
          <Label className="text-base font-semibold">{name}</Label>
          <p className="text-5xl font-display font-bold">{score}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onScoreChange(isA ? Math.max(0, score - 1) : scoreA, isA ? scoreB : Math.max(0, score - 1))}><Minus className="h-4 w-4" /></Button>
            <Button size="sm" onClick={() => onScoreChange(isA ? score + 1 : scoreA, isA ? scoreB : score + 1)}><Plus className="h-4 w-4 mr-1" /> +1</Button>
            <Button size="sm" variant="secondary" onClick={() => onScoreChange(isA ? score + 2 : scoreA, isA ? scoreB : score + 2)}>+2</Button>
            <Button size="sm" variant="secondary" onClick={() => onScoreChange(isA ? score + 3 : scoreA, isA ? scoreB : score + 3)}>+3</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function GenericPanel({
  teamAName, teamBName, scoreA, scoreB, onScoreChange,
}: {
  teamAName: string; teamBName: string; scoreA: number; scoreB: number;
  onScoreChange: (a: number, b: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-2 text-center">
        <Label className="text-base font-semibold">{teamAName}</Label>
        <Input type="number" min={0} value={scoreA} onChange={(e) => onScoreChange(parseInt(e.target.value) || 0, scoreB)} className="text-3xl font-bold text-center h-16" />
      </div>
      <div className="space-y-2 text-center">
        <Label className="text-base font-semibold">{teamBName}</Label>
        <Input type="number" min={0} value={scoreB} onChange={(e) => onScoreChange(scoreA, parseInt(e.target.value) || 0)} className="text-3xl font-bold text-center h-16" />
      </div>
    </div>
  );
}

