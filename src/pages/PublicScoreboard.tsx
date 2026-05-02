import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Match, University } from '@/types/database';
import BracketView from '@/components/tournament/BracketView';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type BracketOption = { id: string; label: string };

export default function PublicScoreboard() {
  const [loading, setLoading] = useState(false);
  const [universities, setUniversities] = useState<University[]>([]);
  const [selectedUniversity, setSelectedUniversity] = useState<string>('');
  const [activeTab, setActiveTab] = useState('live');
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [completedMatches, setCompletedMatches] = useState<Match[]>([]);
  const [brackets, setBrackets] = useState<BracketOption[]>([]);
  const [selectedBracketSportId, setSelectedBracketSportId] = useState<string>('');

  const loadUniversities = useCallback(async () => {
    const { data, error } = await supabase
      .from('universities')
      .select('id, name, short_name, logo_url, country, is_active, created_at, updated_at')
      .eq('is_active', true)
      .order('name');

    if (error) {
      throw error;
    }

    const items = (data as University[]) || [];
    setUniversities(items);
    setSelectedUniversity((current) => current || items[0]?.id || '');
  }, []);

  const fetchMatches = useCallback(async (universityId: string) => {
    const matchSelect = `
      id,
      university_id,
      status,
      scheduled_at,
      started_at,
      completed_at,
      team_a_id,
      team_b_id,
      round,
      group_name,
      phase,
      match_phase,
      winner_id,
      winner_team_id,
      score_a,
      score_b,
      penalty_a,
      penalty_b,
      runs_a,
      runs_b,
      wickets_a,
      wickets_b,
      balls_a,
      balls_b,
      innings,
      target_score,
      toss_winner_id,
      toss_decision,
      team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
      team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
      venue:venues(name),
      event_sport:event_sports!matches_event_sport_id_fkey(sport_category:sports_categories(name))
    `;

    const [{ data: live, error: liveError }, { data: completed, error: completedError }] = await Promise.all([
      supabase
        .from('matches')
        .select(matchSelect)
        .eq('university_id', universityId)
        .eq('status', 'live')
        .order('started_at', { ascending: false })
        .limit(10),
      supabase
        .from('matches')
        .select(matchSelect)
        .eq('university_id', universityId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(10),
    ]);

    if (liveError) {
      throw liveError;
    }

    if (completedError) {
      throw completedError;
    }

    setLiveMatches((live as unknown as Match[]) || []);
    setCompletedMatches((completed as unknown as Match[]) || []);
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadUniversities().finally(() => setLoading(false));
  }, [loadUniversities]);

  useEffect(() => {
    if (!selectedUniversity) {
      return;
    }

    setLoading(true);
    void fetchMatches(selectedUniversity).finally(() => setLoading(false));

    const channel = supabase
      .channel(`public-scoreboard-${selectedUniversity}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `university_id=eq.${selectedUniversity}` },
        (payload) => {
          console.log('Realtime update:', payload);

          const newRow = payload.new as Match | Record<string, never>;
          const oldRow = payload.old as Match | Record<string, never>;
          const nextMatch = (newRow && 'id' in newRow ? newRow : null) as Match | null;
          const prevMatch = (oldRow && 'id' in oldRow ? oldRow : null) as Match | null;

          if (payload.eventType === 'DELETE' && prevMatch?.id) {
            setLiveMatches((current) => current.filter((match) => match.id !== prevMatch.id));
            setCompletedMatches((current) => current.filter((match) => match.id !== prevMatch.id));
            return;
          }

          if (nextMatch?.id) {
            let needsRefetch = false;

            setLiveMatches((current) => {
              const existingMatch = current.find((match) => match.id === nextMatch.id);
              if (!existingMatch && nextMatch.status === 'live') {
                needsRefetch = true;
                return current;
              }
              const withoutCurrent = current.filter((match) => match.id !== nextMatch.id);
              if (existingMatch) {
                const mergedMatch = { ...existingMatch, ...nextMatch };
                return mergedMatch.status === 'live' ? [mergedMatch, ...withoutCurrent].slice(0, 10) : withoutCurrent;
              }
              return current;
            });

            setCompletedMatches((current) => {
              const existingMatch = current.find((match) => match.id === nextMatch.id);
              if (!existingMatch && nextMatch.status === 'completed') {
                needsRefetch = true;
                return current;
              }
              const withoutCurrent = current.filter((match) => match.id !== nextMatch.id);
              if (existingMatch) {
                const mergedMatch = { ...existingMatch, ...nextMatch };
                return mergedMatch.status === 'completed' ? [mergedMatch, ...withoutCurrent].slice(0, 10) : withoutCurrent;
              }
              return current;
            });

            if (needsRefetch) {
              if ((window as any)._scoreboardRefetchTimer) {
                clearTimeout((window as any)._scoreboardRefetchTimer);
              }
              (window as any)._scoreboardRefetchTimer = setTimeout(() => {
                void fetchMatches(selectedUniversity);
              }, 800);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMatches, selectedUniversity]);

  useEffect(() => {
    if (!selectedUniversity) {
      return;
    }

    const loadBracketSports = async () => {
      const { data, error } = await supabase
        .from('event_sports')
        .select('id, event:events!inner(id, name, university_id)')
        .eq('events.university_id', selectedUniversity)
        .limit(20);

      if (error) {
        return;
      }

      const items = ((data || []) as any[]).map((entry) => ({
        id: entry.id as string,
        label: `${entry.event?.name || 'Event'} bracket`,
      }));

      setBrackets(items);
      setSelectedBracketSportId((current) => current || items[0]?.id || '');
    };

    void loadBracketSports();
  }, [selectedUniversity]);

  const selectedUniversityName = useMemo(
    () => universities.find((u) => u.id === selectedUniversity)?.name || 'University',
    [selectedUniversity, universities]
  );

  const MatchCard = ({ match }: { match: Match }) => {
    const isLive = match.status === 'live';
    const sportName = ((match as any).event_sport?.sport_category?.name || '').toLowerCase();
    const isCricket = sportName.includes('cricket');

    return (
      <div
        className={cn(
          'bg-card rounded-xl border p-4 transition-all',
          isLive && 'border-status-live border-2 shadow-lg shadow-status-live/10'
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {match.round || 'Match'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={match.status} />
          </div>
        </div>

        {match.round && (
          <p className="text-xs text-muted-foreground mb-2">
            {match.round}
            {match.group_name ? ` - Group ${match.group_name}` : ''}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex-1 text-center">
            <p className={cn('font-semibold', match.winner_team_id === match.team_a_id && 'text-accent')}>
              {match.team_a?.name || 'TBD'}
            </p>
            <p className="text-xs text-muted-foreground">{match.team_a?.university?.short_name}</p>
            {isCricket && (
              <div className="mt-2">
                <p className="text-3xl font-display font-bold text-foreground">
                  {match.runs_a ?? 0}/{match.wickets_a ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.floor((match.balls_a ?? 0) / 6)}.{(match.balls_a ?? 0) % 6} ov
                </p>
              </div>
            )}
          </div>

          <div className="px-4">
            {!isCricket ? (
              <div className="flex items-center gap-3">
                <span className={cn('text-3xl font-display font-bold', (match.score_a || 0) > (match.score_b || 0) && 'text-accent')}>
                  {match.score_a ?? 0}
                </span>
                <span className="text-xl text-muted-foreground">-</span>
                <span className={cn('text-3xl font-display font-bold', (match.score_b || 0) > (match.score_a || 0) && 'text-accent')}>
                  {match.score_b ?? 0}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <span className="text-xl text-muted-foreground">VS</span>
              </div>
            )}
          </div>

          <div className="flex-1 text-center">
            <p className={cn('font-semibold', match.winner_team_id === match.team_b_id && 'text-accent')}>
              {match.team_b?.name || 'TBD'}
            </p>
            <p className="text-xs text-muted-foreground">{match.team_b?.university?.short_name}</p>
            {isCricket && (
              <div className="mt-2">
                <p className="text-3xl font-display font-bold text-foreground">
                  {match.runs_b ?? 0}/{match.wickets_b ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.floor((match.balls_b ?? 0) / 6)}.{(match.balls_b ?? 0) % 6} ov
                </p>
              </div>
            )}
          </div>
        </div>

        {match.winner_team_id && match.status === 'completed' && (
          <p className="text-xs font-semibold text-accent text-center mt-3 pt-3 border-t border-border">
            Winner: {match.winner_team_id === match.team_a_id ? match.team_a?.name : match.team_b?.name}
          </p>
        )}

        {match.venue?.name && (
          <p className="text-xs text-muted-foreground text-center mt-3 pt-3 border-t border-border">
            Venue: {match.venue.name}
          </p>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading scores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="hero-gradient py-12 text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-display font-bold">Public Scoreboard</h1>
              <p className="mt-2 text-primary-foreground/80">
                Live matches, completed results, and brackets for {selectedUniversityName}
              </p>
            </div>
            <Link to="/">
              <Button variant="secondary">Back to Home</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 max-w-sm">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Select University</p>
          <Select value={selectedUniversity} onValueChange={setSelectedUniversity}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a university" />
            </SelectTrigger>
            <SelectContent>
              {universities.map((university) => (
                <SelectItem key={university.id} value={university.id}>
                  {university.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="live" className="relative">
              Live
              {liveMatches.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-status-live rounded-full animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="brackets">Brackets</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold flex items-center justify-center gap-2">
                <span className="w-2 h-2 bg-status-live rounded-full animate-pulse" />
                Live Matches
              </h2>
              <p className="text-muted-foreground">Happening right now</p>
            </div>
            {liveMatches.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveMatches.map((match) => <MatchCard key={match.id} match={match} />)}
              </div>
            ) : (
              <div className="text-center py-12">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No live matches</h3>
                <p className="text-muted-foreground">Check back later for live action.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold">Recent Results</h2>
              <p className="text-muted-foreground">Completed matches for this university</p>
            </div>
            {completedMatches.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedMatches.map((match) => <MatchCard key={match.id} match={match} />)}
              </div>
            ) : (
              <div className="text-center py-12">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No results yet</h3>
                <p className="text-muted-foreground">Match results will appear here.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="brackets" className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold">Brackets</h2>
              <p className="text-muted-foreground">Public tournament brackets</p>
            </div>
            {brackets.length > 0 ? (
              <>
                <Select value={selectedBracketSportId} onValueChange={setSelectedBracketSportId}>
                  <SelectTrigger className="mx-auto w-full max-w-sm">
                    <SelectValue placeholder="Select bracket" />
                  </SelectTrigger>
                  <SelectContent>
                    {brackets.map((bracket) => (
                      <SelectItem key={bracket.id} value={bracket.id}>
                        {bracket.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedBracketSportId && <BracketView eventSportId={selectedBracketSportId} />}
              </>
            ) : (
              <div className="text-center py-12">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No brackets available</h3>
                <p className="text-muted-foreground">Brackets appear when tournaments are configured.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <footer className="border-t border-border py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 Athletix. University Sports Management System.</p>
        </div>
      </footer>
    </div>
  );
}
