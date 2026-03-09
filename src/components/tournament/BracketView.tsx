import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/types/database';
import { cn } from '@/lib/utils';
import { Loader2, Trophy, ZoomIn, ZoomOut, Maximize2, X, Calendar, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';

interface BracketViewProps {
  eventSportId: string;
}

type BracketMatch = Omit<Match, 'team_a' | 'team_b'> & {
  team_a?: { id: string; name: string; university?: { short_name: string } };
  team_b?: { id: string; name: string; university?: { short_name: string } };
  event_sport?: { sport_category?: { name?: string; icon?: string } };
};

interface VirtualSlot {
  roundLabel: string;
  slotIndex: number;
  match?: BracketMatch;
  sourceA?: { round: string; matchNumber: number };
  sourceB?: { round: string; matchNumber: number };
}

function getRoundLabelByMatchCount(count: number): string {
  if (count === 1) return 'final';
  if (count === 2) return 'semifinal';
  if (count === 4) return 'quarterfinal';
  return 'round_of_16';
}

function formatRoundLabel(round: string) {
  if (round === 'round_of_16') return 'Round of 16';
  if (round === 'quarterfinal') return 'Quarterfinal';
  if (round === 'semifinal') return 'Semifinal';
  if (round === 'final') return 'Final';
  return round;
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5];

export default function BracketView({ eventSportId }: BracketViewProps) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const prevWinnersRef = useRef<Set<string>>(new Set());
  const [newlyAdvanced, setNewlyAdvanced] = useState<Set<string>>(new Set());
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchBracket();
    const channel = supabase
      .channel(`bracket-${eventSportId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchBracket())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventSportId]);

  const fetchBracket = async () => {
    const { data } = await supabase
      .from('matches')
      .select(`
        id, status, match_number, round, round_number, phase, group_name, match_phase, scheduled_at,
        team_a_id, team_b_id, winner_id, winner_team_id, next_match_id,
        score_a, score_b, runs_a, runs_b, wickets_a, wickets_b, balls_a, balls_b, innings, target_score, result_status,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        event_sport:event_sports!matches_event_sport_id_fkey(sport_category:sports_categories(name, icon))
      `)
      .eq('event_sport_id', eventSportId)
      .in('round', ['round_of_16', 'quarterfinal', 'semifinal', 'final', 'Quarter Final', 'Semi Final', 'Final'])
      .order('match_number');

    if (data) {
      const casted = data as unknown as BracketMatch[];
      setMatches(casted);

      const currentWinners = new Set<string>();
      casted.forEach(m => {
        const winnerId = (m as any).winner_id || m.winner_team_id;
        if (winnerId) currentWinners.add(`${m.id}-${winnerId}`);
      });
      const fresh = new Set<string>();
      currentWinners.forEach(key => {
        if (!prevWinnersRef.current.has(key)) fresh.add(key);
      });
      if (fresh.size > 0) {
        setNewlyAdvanced(fresh);
        setTimeout(() => setNewlyAdvanced(new Set()), 2500);
      }
      prevWinnersRef.current = currentWinners;
    }
    setLoading(false);
  };

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom(z => {
      const idx = ZOOM_LEVELS.indexOf(z);
      return idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : z;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => {
      const idx = ZOOM_LEVELS.indexOf(z);
      return idx > 0 ? ZOOM_LEVELS[idx - 1] : z;
    });
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) handleZoomIn();
    else handleZoomOut();
  }, [handleZoomIn, handleZoomOut]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // Build virtual bracket
  const virtualRounds = useMemo(() => {
    if (matches.length === 0) return [];

    const roundMap = new Map<string, BracketMatch[]>();
    matches.forEach(m => {
      const round = m.round || 'Round 1';
      if (!roundMap.has(round)) roundMap.set(round, []);
      roundMap.get(round)!.push(m);
    });

    let round1Label = '';
    let round1Count = 0;
    for (const [label, ms] of roundMap) {
      if (ms.length > round1Count) {
        round1Count = ms.length;
        round1Label = label;
      }
    }

    if (round1Count === 0) return [];

    const totalRounds = Math.ceil(Math.log2(round1Count)) + 1;
    const rounds: VirtualSlot[][] = [];

    let currentMatchCount = round1Count;
    for (let r = 0; r < totalRounds; r++) {
      const roundLabel = r === 0 ? round1Label : getRoundLabelByMatchCount(currentMatchCount);
      const existingMatches = roundMap.get(roundLabel) || [];
      const slots: VirtualSlot[] = [];

      for (let s = 0; s < currentMatchCount; s++) {
        const existingMatch = existingMatches.find(m => m.match_number === s + 1);
        let sourceA: VirtualSlot['sourceA'];
        let sourceB: VirtualSlot['sourceB'];
        if (r > 0) {
          const prevRoundLabel = r === 1 ? round1Label : getRoundLabelByMatchCount(currentMatchCount * 2);
          sourceA = { round: prevRoundLabel, matchNumber: s * 2 + 1 };
          sourceB = { round: prevRoundLabel, matchNumber: s * 2 + 2 };
        }

        slots.push({ roundLabel, slotIndex: s, match: existingMatch, sourceA, sourceB });
      }

      rounds.push(slots);
      currentMatchCount = Math.max(1, Math.floor(currentMatchCount / 2));
      if (currentMatchCount === 0) break;
    }

    return rounds;
  }, [matches]);

  // Find champion
  const champion = useMemo(() => {
    if (virtualRounds.length === 0) return null;
    const finalSlots = virtualRounds[virtualRounds.length - 1];
    const finalMatch = finalSlots?.[0]?.match;
    const winnerId = (finalMatch as any)?.winner_id || finalMatch?.winner_team_id;
    if (!winnerId) return null;
    const isFinalized = finalMatch.status === 'finalized' || finalMatch.status === 'completed_provisional';
    if (!isFinalized) return null;
    return winnerId === finalMatch.team_a_id
      ? finalMatch.team_a?.name
      : finalMatch.team_b?.name;
  }, [virtualRounds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (virtualRounds.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No knockout bracket available</p>
      </div>
    );
  }

  const isFinalRound = (idx: number) => idx === virtualRounds.length - 1;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Champion Banner */}
        <AnimatePresence>
          {champion && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="text-center py-4 px-6 rounded-xl border-2 border-accent bg-accent/10 shadow-[0_0_30px_hsl(var(--accent)/0.3)]"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                className="text-3xl mb-1"
              >
                🏆
              </motion.div>
              <p className="text-xs font-semibold text-accent uppercase tracking-wider">Tournament Champion</p>
              <p className="text-xl font-display font-bold text-accent">{champion}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Zoom Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomOut} disabled={zoom === ZOOM_LEVELS[0]}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomIn} disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 ml-1" onClick={handleResetView}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Scroll to zoom · Drag to pan</p>
        </div>

        {/* Bracket Container with Zoom/Pan */}
        <div
          ref={containerRef}
          className={cn('overflow-hidden rounded-lg border bg-muted/20 relative', isPanning ? 'cursor-grabbing' : 'cursor-grab')}
          style={{ minHeight: 300 }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="p-6 transition-transform duration-150 ease-out"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          >
            <div className="flex gap-6 min-w-max items-start">
              {virtualRounds.map((slots, roundIdx) => (
                <motion.div
                  key={slots[0]?.roundLabel || roundIdx}
                  className="flex flex-col gap-4"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: roundIdx * 0.1 }}
                >
                  <h3 className="text-sm font-semibold text-muted-foreground text-center px-2 pb-2 border-b border-border">
                    {slots[0]?.roundLabel ? formatRoundLabel(slots[0].roundLabel) : ''}
                  </h3>
                  <div
                    className="flex flex-col justify-around gap-4"
                    style={{ minHeight: roundIdx > 0 ? `${Math.pow(2, roundIdx) * 80}px` : 'auto' }}
                  >
                    <AnimatePresence mode="popLayout">
                      {slots.map((slot) => {
                        if (slot.match) {
                          return (
                            <BracketMatchCard
                              key={slot.match.id}
                              match={slot.match}
                              isFinal={isFinalRound(roundIdx)}
                              newlyAdvanced={newlyAdvanced}
                              onClick={() => setSelectedMatch(slot.match!)}
                            />
                          );
                        }

                        const sourceALabel = slot.sourceA
                          ? `Winner of ${slot.sourceA.round} #${slot.sourceA.matchNumber}`
                          : 'TBD';
                        const sourceBLabel = slot.sourceB
                          ? `Winner of ${slot.sourceB.round} #${slot.sourceB.matchNumber}`
                          : 'TBD';

                        return (
                          <motion.div
                            key={`placeholder-${roundIdx}-${slot.slotIndex}`}
                            layout
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            className="w-56 rounded-lg border border-dashed border-border/50 overflow-hidden bg-card/50"
                          >
                            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
                              <span className="text-xs text-muted-foreground/70 truncate italic">{sourceALabel}</span>
                              <span className="text-sm text-muted-foreground">-</span>
                            </div>
                            <div className="flex items-center justify-between px-3 py-2.5">
                              <span className="text-xs text-muted-foreground/70 truncate italic">{sourceBLabel}</span>
                              <span className="text-sm text-muted-foreground">-</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Match Detail Modal */}
        <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />
      </div>
    </TooltipProvider>
  );
}

/* ────────────────── Bracket Match Card with Tooltip ────────────────── */

const BracketMatchCard = memo(function BracketMatchCard({ match, isFinal, newlyAdvanced, onClick }: {
  match: BracketMatch;
  isFinal: boolean;
  newlyAdvanced: Set<string>;
  onClick: () => void;
}) {
  const isLive = match.status === 'live';
  const isFinalized = match.status === 'finalized' || match.status === 'completed_provisional';
  const winnerId = (match as any).winner_id || match.winner_team_id;
  const winnerA = winnerId === match.team_a_id;
  const winnerB = winnerId === match.team_b_id;
  const isNewWinnerA = newlyAdvanced.has(`${match.id}-${match.team_a_id}`);
  const isNewWinnerB = newlyAdvanced.has(`${match.id}-${match.team_b_id}`);
  const isChampion = isFinal && isFinalized && winnerId;
  const loserA = isFinalized && !winnerA && winnerId;
  const loserB = isFinalized && !winnerB && winnerId;

  const sportName = (match.event_sport?.sport_category?.name || '').toLowerCase();
  const isCricket = sportName.includes('cricket');
  const scoreA = isCricket ? (match.runs_a ?? null) : (match.score_a ?? null);
  const scoreB = isCricket ? (match.runs_b ?? null) : (match.score_b ?? null);
  const wicketsA = match.wickets_a ?? 0;
  const wicketsB = match.wickets_b ?? 0;

  const winnerName = winnerId
    ? (winnerId === match.team_a_id ? match.team_a?.name : match.team_b?.name)
    : null;

  const tooltipContent = (
    <div className="space-y-1.5 text-xs max-w-[200px]">
      <p className="font-semibold">{match.round || 'Match'}</p>
      <div className="flex justify-between gap-3">
        <span className={cn(winnerA && 'font-bold')}>{match.team_a?.name || 'TBD'}</span>
        <span className="font-mono">{isCricket ? `${scoreA ?? 0}/${wicketsA}` : (scoreA ?? '-')}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className={cn(winnerB && 'font-bold')}>{match.team_b?.name || 'TBD'}</span>
        <span className="font-mono">{isCricket ? `${scoreB ?? 0}/${wicketsB}` : (scoreB ?? '-')}</span>
      </div>
      {match.match_phase && match.match_phase !== 'not_started' && (
        <p className="text-muted-foreground capitalize">{match.match_phase.replace(/_/g, ' ')}</p>
      )}
      {winnerName && <p className="text-accent font-semibold">🏆 {winnerName}</p>}
      {isLive && <p className="text-status-live font-semibold">🔴 LIVE</p>}
      <p className="text-muted-foreground">{format(new Date(match.scheduled_at), 'MMM d, yyyy h:mm a')}</p>
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          key={match.id}
          layout
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className={cn(
            'w-56 rounded-lg border overflow-hidden bg-card transition-all duration-500 cursor-pointer hover:shadow-md hover:border-accent/50',
            isLive && 'border-status-live border-2 shadow-lg',
            isFinalized && !isChampion && 'border-accent/30',
            isChampion && 'border-accent border-2 shadow-[0_0_20px_hsl(var(--accent)/0.4)]',
            (isNewWinnerA || isNewWinnerB) && 'shadow-[0_0_24px_hsl(var(--accent)/0.5)]'
          )}
        >
          {/* Champion banner */}
          <AnimatePresence>
            {isChampion && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="bg-accent/15 text-accent text-xs text-center py-1.5 font-bold flex items-center justify-center gap-1"
              >
                <Trophy className="h-3 w-3" /> CHAMPION
              </motion.div>
            )}
          </AnimatePresence>

          <TeamRow
            name={match.team_a?.name || 'TBD'}
            score={scoreA}
            scoreDetail={isCricket ? `/${wicketsA}` : undefined}
            isWinner={winnerA}
            isLoser={!!loserA}
            isNewWinner={isNewWinnerA}
            hasBorder
          />
          <TeamRow
            name={match.team_b?.name || 'TBD'}
            score={scoreB}
            scoreDetail={isCricket ? `/${wicketsB}` : undefined}
            isWinner={winnerB}
            isLoser={!!loserB}
            isNewWinner={isNewWinnerB}
            hasBorder={false}
          />

          {isLive && (
            <motion.div
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="bg-status-live/10 text-status-live text-xs text-center py-1 font-semibold"
            >
              🔴 LIVE
            </motion.div>
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="right" className="p-3">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
});

/* ────────────────── Team Row ────────────────── */

function TeamRow({ name, score, scoreDetail, isWinner, isLoser, isNewWinner, hasBorder }: {
  name: string;
  score: number | null;
  scoreDetail?: string;
  isWinner: boolean;
  isLoser: boolean;
  isNewWinner: boolean;
  hasBorder: boolean;
}) {
  return (
    <motion.div
      animate={isNewWinner ? {
        backgroundColor: ['hsl(var(--accent) / 0)', 'hsl(var(--accent) / 0.25)', 'hsl(var(--accent) / 0.1)'],
      } : {}}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={cn(
        'flex items-center justify-between px-3 py-2 transition-opacity duration-500',
        hasBorder && 'border-b border-border',
        isWinner && !isNewWinner && 'bg-accent/10',
        isLoser && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AnimatePresence>
          {isWinner && (
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            >
              <Trophy className="h-3 w-3 text-accent shrink-0" />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.span
          layout
          className={cn('text-sm truncate', isWinner ? 'font-bold' : 'font-medium')}
        >
          {name}
        </motion.span>
      </div>
      <motion.span
        key={`${score}`}
        initial={{ scale: 1.3, color: 'hsl(var(--accent))' }}
        animate={{ scale: 1, color: isWinner ? 'hsl(var(--accent))' : 'hsl(var(--foreground))' }}
        transition={{ duration: 0.3 }}
        className="text-sm font-bold"
      >
        {score !== null ? `${score}${scoreDetail || ''}` : '-'}
      </motion.span>
    </motion.div>
  );
}

/* ────────────────── Match Detail Modal ────────────────── */

function MatchDetailModal({ match, onClose }: { match: BracketMatch | null; onClose: () => void }) {
  if (!match) return null;

  const sportName = (match.event_sport?.sport_category?.name || '').toLowerCase();
  const isCricket = sportName.includes('cricket');
  const scoreA = isCricket ? (match.runs_a ?? 0) : (match.score_a ?? 0);
  const scoreB = isCricket ? (match.runs_b ?? 0) : (match.score_b ?? 0);
  const wicketsA = match.wickets_a ?? 0;
  const wicketsB = match.wickets_b ?? 0;
  const ballsA = match.balls_a ?? 0;
  const ballsB = match.balls_b ?? 0;
  const winnerId = (match as any).winner_id || match.winner_team_id;
  const winnerA = winnerId === match.team_a_id;
  const winnerB = winnerId === match.team_b_id;
  const winnerName = winnerId
    ? (winnerA ? match.team_a?.name : match.team_b?.name)
    : null;

  return (
    <Dialog open={!!match} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{match.event_sport?.sport_category?.icon}</span>
            <span>{match.round || 'Match'}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scoreboard */}
          <div className="bg-muted/30 rounded-lg p-4">
            {isCricket ? (
              <div className="space-y-3">
                <div className={cn('flex justify-between items-center', winnerA && 'text-accent font-bold')}>
                  <div>
                    <p className="font-semibold">{winnerA && '🏆 '}{match.team_a?.name || 'TBD'}</p>
                    <p className="text-xs text-muted-foreground">{match.team_a?.university?.short_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-display font-bold">{scoreA}/{wicketsA}</p>
                    <p className="text-xs text-muted-foreground">{Math.floor(ballsA / 6)}.{ballsA % 6} overs</p>
                  </div>
                </div>
                <div className="border-t border-border" />
                <div className={cn('flex justify-between items-center', winnerB && 'text-accent font-bold')}>
                  <div>
                    <p className="font-semibold">{winnerB && '🏆 '}{match.team_b?.name || 'TBD'}</p>
                    <p className="text-xs text-muted-foreground">{match.team_b?.university?.short_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-display font-bold">{scoreB}/{wicketsB}</p>
                    <p className="text-xs text-muted-foreground">{Math.floor(ballsB / 6)}.{ballsB % 6} overs</p>
                  </div>
                </div>
                {match.target_score && (
                  <div className="text-center text-xs font-medium text-accent p-2 rounded bg-accent/10">
                    Target: {match.target_score}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className={cn('text-center flex-1', winnerA && 'text-accent')}>
                  <p className={cn('font-semibold', winnerA && 'font-bold')}>{winnerA && '🏆 '}{match.team_a?.name || 'TBD'}</p>
                  <p className="text-xs text-muted-foreground">{match.team_a?.university?.short_name}</p>
                </div>
                <div className="px-4 flex items-center gap-3">
                  <span className={cn('text-3xl font-display font-bold', winnerA && 'text-accent')}>{scoreA}</span>
                  <span className="text-xl text-muted-foreground">-</span>
                  <span className={cn('text-3xl font-display font-bold', winnerB && 'text-accent')}>{scoreB}</span>
                </div>
                <div className={cn('text-center flex-1', winnerB && 'text-accent')}>
                  <p className={cn('font-semibold', winnerB && 'font-bold')}>{winnerB && '🏆 '}{match.team_b?.name || 'TBD'}</p>
                  <p className="text-xs text-muted-foreground">{match.team_b?.university?.short_name}</p>
                </div>
              </div>
            )}
          </div>

          {/* Match Info */}
          <div className="space-y-2 text-sm">
            {winnerName && (
              <div className="flex items-center gap-2 text-accent font-semibold">
                <Trophy className="h-4 w-4" />
                Winner: {winnerName}
                {match.result_status === 'advanced' && <span className="text-xs bg-accent/10 px-2 py-0.5 rounded">Advanced ➡</span>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(match.scheduled_at), 'MMM d, yyyy')}
              </div>
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" />
                {match.status}
              </div>
            </div>

            {match.match_phase && match.match_phase !== 'not_started' && (
              <p className="text-xs text-muted-foreground capitalize">Phase: {match.match_phase.replace(/_/g, ' ')}</p>
            )}

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
