import { useEffect, useMemo, useState, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/types/database';
import { cn } from '@/lib/utils';
import { Trophy } from 'lucide-react';
import { motion } from 'framer-motion';

interface TournamentBracketProps {
  eventSportId: string;
  highlightMatchId?: string;
}

const MATCH_WIDTH = 200;
const MATCH_HEIGHT = 70;
const ROUND_SPACING = 60;
const VERTICAL_SPACING = 30;

export function TournamentBracket({ eventSportId, highlightMatchId }: TournamentBracketProps) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    fetchBracket();
    const channel = supabase
      .channel(`bracket-simple-${eventSportId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `event_sport_id=eq.${eventSportId}` }, () => fetchBracket())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventSportId]);

  const fetchBracket = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name),
        team_b:teams!matches_team_b_id_fkey(id, name)
      `)
      .eq('event_sport_id', eventSportId)
      .in('round', ['round_of_16', 'quarterfinal', 'semifinal', 'final', 'semi', 'final'])
      .order('round_number', { ascending: true })
      .order('match_number', { ascending: true });

    setMatches((data as unknown as Match[]) || []);
    setLoading(false);
  };

  const { positionedMatches, connectors, totalWidth, totalHeight } = useMemo(() => {
    if (matches.length === 0) return { positionedMatches: [], connectors: [], totalWidth: 0, totalHeight: 0 };

    const roundGroups = new Map<number, Match[]>();
    matches.forEach(m => {
      const rn = m.round_number || 1;
      if (!roundGroups.has(rn)) roundGroups.set(rn, []);
      roundGroups.get(rn)!.push(m);
    });

    const sortedRoundNums = Array.from(roundGroups.keys()).sort((a, b) => a - b);
    const positioned: any[] = [];
    const idToPos = new Map<string, any>();

    // Position Round 1
    const round1 = roundGroups.get(sortedRoundNums[0]) || [];
    round1.forEach((m, i) => {
      const p = { match: m, x: 0, y: i * (MATCH_HEIGHT + VERTICAL_SPACING) };
      positioned.push(p);
      idToPos.set(m.id, p);
    });

    // Subsequent rounds
    for (let r = 1; r < sortedRoundNums.length; r++) {
      const roundMatches = roundGroups.get(sortedRoundNums[r]) || [];
      roundMatches.forEach((m, i) => {
        const sources = positioned.filter(p => p.match.next_match_id === m.id);
        let y: number;

        if (sources.length === 2) {
          y = (sources[0].y + sources[1].y) / 2;
        } else if (sources.length === 1) {
          y = sources[0].y;
        } else {
          // Fallback if no sources
          y = i * (MATCH_HEIGHT + VERTICAL_SPACING) * Math.pow(2, r);
        }

        const p = { match: m, x: r * (MATCH_WIDTH + ROUND_SPACING), y };
        positioned.push(p);
        idToPos.set(m.id, p);
      });
    }

    // Connectors
    const conns: any[] = [];
    positioned.forEach(p => {
      if (p.match.next_match_id) {
        const next = idToPos.get(p.match.next_match_id);
        if (next) {
          conns.push({
            id: p.match.id,
            x1: p.x + MATCH_WIDTH,
            y1: p.y + MATCH_HEIGHT / 2,
            x2: next.x,
            y2: next.y + MATCH_HEIGHT / 2
          });
        }
      }
    });

    let minY = 0;
    let maxY = 0;
    if (positioned.length > 0) {
      minY = Math.min(...positioned.map(p => p.y));
      maxY = Math.max(...positioned.map(p => p.y));
    }

    const offsetY = -minY + 50; // padding top
    positioned.forEach(p => p.y += offsetY);
    conns.forEach(c => {
      c.y1 += offsetY;
      c.y2 += offsetY;
    });

    return { 
      positionedMatches: positioned, 
      connectors: conns,
      totalWidth: sortedRoundNums.length * (MATCH_WIDTH + ROUND_SPACING),
      totalHeight: (maxY - minY) + MATCH_HEIGHT + 100
    };
  }, [matches]);

  if (loading || matches.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div 
        className="relative" 
        style={{ width: totalWidth, height: totalHeight, minHeight: '300px' }}
      >
        <svg className="absolute inset-0 pointer-events-none" width={totalWidth} height={totalHeight}>
          {connectors.map(c => {
            const midX = c.x1 + (c.x2 - c.x1) / 2;
            return (
              <path
                key={c.id}
                d={`M ${c.x1} ${c.y1} L ${midX} ${c.y1} L ${midX} ${c.y2} L ${c.x2} ${c.y2}`}
                fill="none"
                stroke="hsl(var(--accent) / 0.3)"
                strokeWidth="2"
              />
            );
          })}
        </svg>

        {positionedMatches.map(p => (
          <div 
            key={p.match.id} 
            className="absolute" 
            style={{ left: p.x, top: p.y, width: MATCH_WIDTH, height: MATCH_HEIGHT }}
          >
            <MatchNode match={p.match} isHighlighted={highlightMatchId === p.match.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

const MatchNode = memo(({ match, isHighlighted }: { match: Match; isHighlighted: boolean }) => {
  const winnerId = match.winner_id || match.winner_team_id;
  return (
    <div className={cn(
      "bg-card border rounded-md overflow-hidden flex flex-col h-full shadow-sm transition-all",
      isHighlighted ? "border-accent ring-1 ring-accent" : "border-border/60"
    )}>
      {[
        { team: match.team_a, id: match.team_a_id, score: match.score_a },
        { team: match.team_b, id: match.team_b_id, score: match.score_b }
      ].map((t, i) => (
        <div key={i} className={cn(
          "flex-1 flex items-center justify-between px-2 text-[10px]",
          i === 0 && "border-b border-border/40",
          winnerId === t.id && "bg-accent/5"
        )}>
          <div className="flex items-center gap-1 min-w-0">
            {winnerId === t.id && <Trophy className="h-2 w-2 text-accent" />}
            <span className={cn("truncate", winnerId === t.id ? "font-bold text-foreground" : "text-muted-foreground")}>
              {t.team?.name || 'TBD'}
            </span>
          </div>
          <span className="font-mono font-bold">{t.score ?? '-'}</span>
        </div>
      ))}
    </div>
  );
});
