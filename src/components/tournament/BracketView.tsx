import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/types/database';
import { cn } from '@/lib/utils';
import { Loader2, Trophy, ZoomIn, ZoomOut, Maximize2, Calendar, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { measureWithTimeout, REQUEST_TIMEOUT_MS } from '@/lib/performance';

/* -------------------------------------------------------------------------- */
/*                                   Constants                                */
/* -------------------------------------------------------------------------- */

const MATCH_WIDTH = 220;
const MATCH_HEIGHT = 80;
const ROUND_SPACING = 100;
const VERTICAL_SPACING = 40;
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5];

/* -------------------------------------------------------------------------- */
/*                                     Types                                  */
/* -------------------------------------------------------------------------- */

type BracketMatch = Omit<Match, 'team_a' | 'team_b'> & {
  team_a?: { id: string; name: string; university?: { short_name: string } };
  team_b?: { id: string; name: string; university?: { short_name: string } };
  event_sport?: { sport_category?: { name?: string; icon?: string } };
  // Fallbacks for direct engine preview without DB
  isByeMatch?: boolean;
  teamA?: { id: string; name: string };
  teamB?: { id: string; name: string };
  winner?: { id: string; name: string };
  matchIndex?: number;
  roundNumber?: number;
};

interface PositionedMatch {
  match: BracketMatch;
  x: number;
  y: number;
  roundIndex: number;
  matchIndexInRound: number;
}

interface Connector {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: 'straight' | 'elbow';
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

function formatRoundLabel(round: string) {
  const r = round.toLowerCase();
  if (r === 'round_of_16') return 'Round of 16';
  if (r === 'quarterfinal' || r === 'quarter_final') return 'Quarter-Finals';
  if (r === 'semifinal' || r === 'semi_final' || r === 'semi') return 'Semi-Finals';
  if (r === 'final') return 'Grand Final';
  return round;
}

/* -------------------------------------------------------------------------- */
/*                               Main Component                               */
/* -------------------------------------------------------------------------- */

export default function BracketView({ eventSportId }: { eventSportId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchBracket();
    const channel = supabase
      .channel(`bracket-${eventSportId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `event_sport_id=eq.${eventSportId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updatedMatch = payload.new as BracketMatch;
            setMatches((current) =>
              current.map((m) => (m.id === updatedMatch.id ? { ...m, ...updatedMatch } : m))
            );
          } else {
            void fetchBracket();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventSportId]);

  const fetchBracket = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await measureWithTimeout(`bracket ${eventSportId}`, async () =>
        supabase
          .from('matches')
          .select(`
            id, status, match_number, round, round_number, phase, group_name, match_phase, scheduled_at, is_bye_match,
            team_a_id, team_b_id, winner_id, winner_team_id, next_match_id,
            score_a, score_b, runs_a, runs_b, wickets_a, wickets_b, balls_a, balls_b, innings, target_score, result_status,
            team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
            team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
            event_sport:event_sports!matches_event_sport_id_fkey(sport_category:sports_categories(name, icon))
          `)
          .eq('event_sport_id', eventSportId)
          .in('round', ['round_of_16', 'quarterfinal', 'semifinal', 'final', 'Quarter Final', 'Semi Final', 'Final', 'semi', 'semi_final'])
          .order('round_number', { ascending: true })
          .order('match_number', { ascending: true }),
        REQUEST_TIMEOUT_MS
      );

      if (fetchError) throw fetchError;
      setMatches((data as unknown as BracketMatch[]) || []);
    } catch (err: any) {
      console.error('Failed to load bracket:', err);
      setError(err.message || 'Unable to load the bracket.');
    } finally {
      setLoading(false);
    }
  };

  // Positioning Engine
  const { positionedMatches, connectors, rounds, totalWidth, totalHeight } = useMemo(() => {
    if (matches.length === 0) return { positionedMatches: [], connectors: [], rounds: [], totalWidth: 0, totalHeight: 0 };

    const rounds: Record<number, BracketMatch[]> = {};
    matches.forEach((match, index) => {
      match.matchIndex = index;
      const roundNumber = match.round_number || 1;
      match.roundNumber = roundNumber;
      
      if (!rounds[roundNumber]) {
        rounds[roundNumber] = [];
      }
      rounds[roundNumber].push(match);
    });

    const sortedRoundNums = Object.keys(rounds).map(Number).sort((a, b) => a - b);
    const positioned: PositionedMatch[] = [];
    const idToPositioned = new Map<string, PositionedMatch>();
    const roundLabels: string[] = [];

    const baseSpacing = MATCH_HEIGHT + VERTICAL_SPACING;

    sortedRoundNums.forEach((roundNum, r) => {
      const roundMatches = rounds[roundNum];

      // LOCK ORDER
      roundMatches.sort((a, b) => (a.matchIndex ?? 0) - (b.matchIndex ?? 0));

      roundLabels.push(roundMatches[0]?.round || `Round ${r + 1}`);

      // Dynamic spacing: baseSpacing * (2 ^ roundIndex)
      const currentSpacing = baseSpacing * Math.pow(2, r);
      // Offset ensures that disconnected/root matches perfectly align with standard bracket geometry
      const startOffset = (currentSpacing - baseSpacing) / 2;

      roundMatches.forEach((m, i) => {
        // Find sources (parent matches from the previous round)
        const sources = positioned.filter(p => p.match.next_match_id === m.id);

        let y: number;

        if (sources.length > 0) {
          // Vertically center this match perfectly relative to its actual parent matches
          const sumY = sources.reduce((sum, src) => sum + src.y, 0);
          y = sumY / sources.length;
        } else {
          // Round 1 matches (or disconnected trees) rely strictly on dynamic geometric spacing
          // BYE matches take up a full index slot (i), refusing to collapse spacing.
          y = startOffset + (i * currentSpacing);
        }

        const pm: PositionedMatch = {
          match: m,
          x: r * (MATCH_WIDTH + ROUND_SPACING),
          y,
          roundIndex: r,
          matchIndexInRound: i
        };
        positioned.push(pm);
        idToPositioned.set(m.id, pm);
      });
    });

    // Generate Connectors
    const conns: Connector[] = [];
    positioned.forEach(pm => {
      if (pm.match.next_match_id) {
        const nextPm = idToPositioned.get(pm.match.next_match_id);
        if (nextPm) {
          const startX = pm.x + MATCH_WIDTH;
          const startY = pm.y + MATCH_HEIGHT / 2;
          const endX = nextPm.x;
          const endY = nextPm.y + MATCH_HEIGHT / 2;
          const midX = startX + (endX - startX) / 2;

          conns.push({
            id: `c-${pm.match.id}`,
            x1: startX,
            y1: startY,
            x2: endX,
            y2: endY,
            type: 'elbow'
          });
        }
      }
    });

    const maxRound = sortedRoundNums.length;
    const totalWidthOut = maxRound * MATCH_WIDTH + (maxRound - 1) * ROUND_SPACING;

    // Calculate dynamic bounding box
    let minY = 0;
    let maxY = 0;
    if (positioned.length > 0) {
      minY = Math.min(...positioned.map(p => p.y));
      maxY = Math.max(...positioned.map(p => p.y));
    }
    const calculatedTotalHeight = (maxY - minY) + MATCH_HEIGHT + 100;

    // Apply global Y offset to bring the entire bracket down by 50px
    const offsetY = -minY + 50;

    positioned.forEach(p => {
      p.y += offsetY;
    });

    conns.forEach(c => {
      c.y1 += offsetY;
      c.y2 += offsetY;
    });

    return {
      positionedMatches: positioned,
      connectors: conns,
      rounds: roundLabels,
      totalWidth: totalWidthOut,
      totalHeight: calculatedTotalHeight
    };
  }, [matches]);

  const centeredPan = useMemo(() => {
    if (!containerRef.current) return { x: 0, y: 0 };

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    return {
      x: (containerWidth - totalWidth * zoom) / 2,
      y: (containerHeight - totalHeight * zoom) / 2,
    };
  }, [zoom, totalWidth, totalHeight]);

  const fitScale = useMemo(() => {
    if (!containerRef.current || totalWidth === 0 || totalHeight === 0) return 1;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    const scaleX = containerWidth / (totalWidth + 100);
    const scaleY = containerHeight / (totalHeight + 100);

    return Math.min(scaleX, scaleY, 1);
  }, [totalWidth, totalHeight]);

  useEffect(() => {
    if (fitScale) {
      setZoom(fitScale);
    }
  }, [fitScale]);

  // Find Champion
  const champion = useMemo(() => {
    const finalMatch = matches.find(m => m.round?.toLowerCase() === 'final');
    if (!finalMatch || finalMatch.status !== 'completed') return null;
    const winnerId = finalMatch.winner_id || finalMatch.winner_team_id;
    if (!winnerId) return null;
    return winnerId === finalMatch.team_a_id ? finalMatch.team_a?.name : finalMatch.team_b?.name;
  }, [matches]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => setZoom(z => ZOOM_LEVELS[Math.min(ZOOM_LEVELS.indexOf(z) + 1, ZOOM_LEVELS.length - 1)]), []);
  const handleZoomOut = useCallback(() => setZoom(z => ZOOM_LEVELS[Math.max(ZOOM_LEVELS.indexOf(z) - 1, 0)]), []);
  const handleResetView = useCallback(() => {
    setZoom(fitScale);
    setPan({ x: 0, y: 0 });
  }, [fitScale]);
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) handleZoomIn(); else handleZoomOut();
    }
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

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;
  if (error) return <div className="text-center py-12"><Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><p className="text-muted-foreground">{error}</p></div>;
  if (matches.length === 0) return <div className="text-center py-12"><Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><p className="text-muted-foreground">No knockout bracket available</p></div>;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Champion Banner */}
        <AnimatePresence>
          {champion && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="text-center py-4 px-6 rounded-xl border-2 border-accent bg-accent/10 shadow-[0_0_30px_hsl(var(--accent)/0.3)] mb-6"
            >
              <Trophy className="h-8 w-8 text-accent mx-auto mb-2" />
              <p className="text-xs font-semibold text-accent uppercase tracking-wider">Tournament Champion</p>
              <p className="text-2xl font-display font-bold text-accent">{champion}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="flex items-center justify-between bg-card/50 p-2 rounded-lg border border-border/50">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut} disabled={zoom === ZOOM_LEVELS[0]}><ZoomOut className="h-4 w-4" /></Button>
            <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn} disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 ml-1" onClick={handleResetView}><Maximize2 className="h-4 w-4" /></Button>
          </div>
          <div className="flex items-center gap-4">
            {rounds.map((r, i) => (
              <div key={i} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-2">
                {formatRoundLabel(r)}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground hidden sm:block">Ctrl + Scroll to Zoom Â· Drag to Pan</p>
        </div>

        {/* Viewport */}
        <div
          ref={containerRef}
          className={cn(
            'overflow-hidden rounded-xl border bg-muted/10 relative shadow-inner',
            isPanning ? 'cursor-grabbing' : 'cursor-grab'
          )}
          style={{ height: '70vh', minHeight: '500px' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="absolute transition-transform duration-75 ease-out"
            style={{
              transform: `
  translate(${pan.x + centeredPan.x}px, ${pan.y + centeredPan.y}px)
  scale(${zoom})
`,
              transformOrigin: '0 0',
              width: totalWidth + 100,
              height: totalHeight + 100,
            }}
          >
            {/* SVG Connectors Layer */}
            <svg
              className="absolute top-0 left-0 pointer-events-none"
              width={totalWidth + 100}
              height={totalHeight + 100}
              style={{ overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--accent) / 0.2)" />
                  <stop offset="100%" stopColor="hsl(var(--accent) / 0.5)" />
                </linearGradient>
              </defs>
              {connectors.map(conn => {
                const midX = conn.x1 + (conn.x2 - conn.x1) / 2;
                // Draw a nice elbow line: ──┐ ├── ──┘
                // Actually it's more like: ──┐
                //                            ├─
                //                          ──┘
                const path = `M ${conn.x1} ${conn.y1} L ${midX} ${conn.y1} L ${midX} ${conn.y2} L ${conn.x2} ${conn.y2}`;

                return (
                  <motion.path
                    key={conn.id}
                    d={path}
                    fill="none"
                    stroke="url(#line-grad)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1, delay: 0.5 }}
                  />
                );
              })}
            </svg>

            {/* Matches Layer */}
            {positionedMatches.map((pm) => (
              <div
                key={pm.match.id}
                className="absolute"
                style={{
                  left: pm.x,
                  top: pm.y,
                  width: MATCH_WIDTH,
                  height: MATCH_HEIGHT,
                }}
              >
                <BracketMatchCard
                  match={pm.match}
                  onClick={() => setSelectedMatch(pm.match)}
                />
              </div>
            ))}
          </div>
        </div>

        <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />
      </div>
    </TooltipProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Match Card                                   */
/* -------------------------------------------------------------------------- */

const BracketMatchCard = memo(function BracketMatchCard({ match, onClick }: {
  match: BracketMatch;
  onClick: () => void;
}) {
  const isLive = match.status === 'live';
  const isFinalized = match.status === 'completed';
  const winnerId = match.winner_id || match.winner_team_id || match.winner?.id;

  const sportName = (match.event_sport?.sport_category?.name || '').toLowerCase();
  const isCricket = sportName.includes('cricket');
  const scoreA = isCricket ? (match.runs_a ?? null) : (match.score_a ?? null);
  const scoreB = isCricket ? (match.runs_b ?? null) : (match.score_b ?? null);

  const isBye = match.is_bye_match || match.isByeMatch;
  const teamA = match.team_a || match.teamA;
  const teamB = match.team_b || match.teamB;

  if (isBye) {
    const advancingTeam = teamA || teamB;
    return (
      <div className="w-full h-full rounded-lg border border-accent/20 bg-accent/5 flex flex-col items-center justify-center opacity-60">
        <span className="text-[9px] uppercase font-bold text-accent tracking-tighter">BYE - Auto Advance</span>
        <span className="text-sm font-bold truncate px-2 w-full text-center">{advancingTeam?.name || 'TBD'}</span>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          whileHover={{ y: -2, scale: 1.02 }}
          onClick={onClick}
          className={cn(
            'w-full h-full rounded-lg border bg-card shadow-sm flex flex-col overflow-hidden transition-all cursor-pointer select-none',
            isLive ? 'border-status-live ring-2 ring-status-live/20' : 'border-border/60',
            isFinalized && 'border-accent/40 bg-accent/[0.02]'
          )}
        >
          {/* Team A */}
          <div className={cn(
            'flex-1 flex items-center justify-between px-3 border-b border-border/40',
            winnerId === (match.team_a_id || teamA?.id) && 'bg-accent/5'
          )}>
            <div className="flex items-center gap-2 min-w-0">
              {winnerId === (match.team_a_id || teamA?.id) && <Trophy className="h-3 w-3 text-accent shrink-0" />}
              <span className={cn(
                'text-xs truncate transition-colors',
                winnerId === (match.team_a_id || teamA?.id) ? 'font-bold text-foreground' : 'text-muted-foreground',
                !(match.team_a_id || teamA?.id) && 'italic opacity-50'
              )}>
                {teamA?.name || 'TBD'}
              </span>
            </div>
            <span className={cn('text-xs font-mono font-bold', winnerId === (match.team_a_id || teamA?.id) ? 'text-accent' : 'text-muted-foreground')}>
              {scoreA !== null ? scoreA : '-'}
            </span>
          </div>

          {/* Team B */}
          <div className={cn(
            'flex-1 flex items-center justify-between px-3',
            winnerId === (match.team_b_id || teamB?.id) && 'bg-accent/5'
          )}>
            <div className="flex items-center gap-2 min-w-0">
              {winnerId === (match.team_b_id || teamB?.id) && <Trophy className="h-3 w-3 text-accent shrink-0" />}
              <span className={cn(
                'text-xs truncate transition-colors',
                winnerId === (match.team_b_id || teamB?.id) ? 'font-bold text-foreground' : 'text-muted-foreground',
                !(match.team_b_id || teamB?.id) && 'italic opacity-50'
              )}>
                {teamB?.name || 'TBD'}
              </span>
            </div>
            <span className={cn('text-xs font-mono font-bold', winnerId === (match.team_b_id || teamB?.id) ? 'text-accent' : 'text-muted-foreground')}>
              {scoreB !== null ? scoreB : '-'}
            </span>
          </div>

          {isLive && (
            <div className="h-1 w-full bg-status-live animate-pulse" />
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="p-1 space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">{match.round}</p>
          <p className="text-xs">{format(new Date(match.scheduled_at || new Date()), 'MMM d, HH:mm')}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});

/* -------------------------------------------------------------------------- */
/*                               Detail Modal                                 */
/* -------------------------------------------------------------------------- */

function MatchDetailModal({ match, onClose }: { match: BracketMatch | null; onClose: () => void }) {
  if (!match) return null;
  const winnerId = match.winner_id || match.winner_team_id || match.winner?.id;
  const teamA = match.team_a || match.teamA;
  const teamB = match.team_b || match.teamB;

  return (
    <Dialog open={!!match} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{match.event_sport?.sport_category?.icon}</span>
            <span>{match.round || 'Match Detail'}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-center flex-1 space-y-2">
              <div className="h-16 w-16 bg-muted rounded-full mx-auto flex items-center justify-center text-xl font-bold">
                {teamA?.name?.[0] || '?'}
              </div>
              <p className={cn('font-bold', winnerId === (match.team_a_id || teamA?.id) && 'text-accent')}>{teamA?.name || 'TBD'}</p>
            </div>
            <div className="text-2xl font-display font-black text-muted-foreground italic">VS</div>
            <div className="text-center flex-1 space-y-2">
              <div className="h-16 w-16 bg-muted rounded-full mx-auto flex items-center justify-center text-xl font-bold">
                {teamB?.name?.[0] || '?'}
              </div>
              <p className={cn('font-bold', winnerId === (match.team_b_id || teamB?.id) && 'text-accent')}>{teamB?.name || 'TBD'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-xl">
            <div className="space-y-1">
              <p className="text-muted-foreground flex items-center gap-2"><Calendar className="h-3 w-3" /> Date</p>
              <p className="font-semibold">{format(new Date(match.scheduled_at || new Date()), 'PPP')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground flex items-center gap-2"><Target className="h-3 w-3" /> Status</p>
              <p className="font-semibold capitalize">{match.status || 'Scheduled'}</p>
            </div>
          </div>

          <Button className="w-full" variant="outline" onClick={onClose}>Close Bracket</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
