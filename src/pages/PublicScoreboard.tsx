import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Match, Event } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Calendar, Target, ArrowRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import BracketView from '@/components/tournament/BracketView';
import StandingsTable from '@/components/tournament/StandingsTable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function PublicScoreboard() {
  const [loading, setLoading] = useState(true);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [bracketEvents, setBracketEvents] = useState<any[]>([]);
  const [selectedBracketSportId, setSelectedBracketSportId] = useState('');
  const [standingsEvents, setStandingsEvents] = useState<any[]>([]);
  const [selectedStandingsSportId, setSelectedStandingsSportId] = useState('');

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('public-scoreboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchMatches())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchMatches(), fetchEvents(), fetchTournamentData()]);
    setLoading(false);
  };

  const fetchMatches = async () => {
    const matchSelect = `
      *,
      team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
      team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
      venue:venues(name),
      event_sport:event_sports(sport_category:sports_categories(name, icon))
    `;

    const [{ data: live }, { data: recent }] = await Promise.all([
      supabase.from('matches').select(matchSelect).eq('status', 'live').order('started_at', { ascending: false }),
      supabase.from('matches').select(matchSelect).eq('status', 'finalized').order('finalized_at', { ascending: false }).limit(10),
    ]);

    setLiveMatches((live as unknown as Match[]) || []);
    setRecentMatches((recent as unknown as Match[]) || []);
  };

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select(`*, university:universities(name, short_name)`)
      .in('status', ['approved', 'active'])
      .gte('end_date', new Date().toISOString().split('T')[0])
      .order('start_date')
      .limit(6);
    setUpcomingEvents((data as unknown as Event[]) || []);
  };

  const fetchTournamentData = async () => {
    // Fetch events that have tournament_type set
    const { data: events } = await supabase
      .from('events')
      .select('id, name, tournament_type')
      .in('status', ['approved', 'active'])
      .not('tournament_type', 'is', null);

    if (!events || events.length === 0) return;

    // Fetch event_sports for these events
    const eventIds = events.map(e => e.id);
    const { data: sports } = await supabase
      .from('event_sports')
      .select('id, event_id, sport_category:sports_categories(name, icon)')
      .in('event_id', eventIds);

    if (!sports) return;

    const bracketSports = sports.filter(s => {
      const ev = events.find(e => e.id === s.event_id);
      return ev?.tournament_type === 'knockout' || ev?.tournament_type === 'group';
    }).map(s => ({ ...s, event: events.find(e => e.id === s.event_id) }));

    const standingsSports = sports.filter(s => {
      const ev = events.find(e => e.id === s.event_id);
      return ev?.tournament_type === 'group' || ev?.tournament_type === 'league';
    }).map(s => ({ ...s, event: events.find(e => e.id === s.event_id) }));

    setBracketEvents(bracketSports);
    setStandingsEvents(standingsSports);

    if (bracketSports.length > 0) setSelectedBracketSportId(bracketSports[0].id);
    if (standingsSports.length > 0) setSelectedStandingsSportId(standingsSports[0].id);
  };

  const MatchCard = ({ match }: { match: Match }) => {
    const sportName = (match.event_sport?.sport_category?.name || '').toLowerCase();
    const isCricket = sportName.includes('cricket');
    const isFootball = sportName.includes('football') || sportName.includes('soccer');
    const isLive = match.status === 'live';
    const phase = (match as any).match_phase || '';
    const winnerId = match.winner_id ?? match.winner_team_id;

    const scoreA = isCricket ? (match.runs_a ?? 0) : (match.score_a ?? 0);
    const scoreB = isCricket ? (match.runs_b ?? 0) : (match.score_b ?? 0);
    const wicketsA = match.wickets_a ?? 0;
    const wicketsB = match.wickets_b ?? 0;
    const ballsA = match.balls_a ?? 0;
    const ballsB = match.balls_b ?? 0;
    const innings = match.innings ?? (phase === 'second_innings' ? 2 : 1);
    const target = match.target_score ?? null;
    const tossWinnerId = (match as any).toss_winner_id;
    const tossDecision = (match as any).toss_decision;
    const teamAName = (match.team_a as any)?.name;
    const teamBName = (match.team_b as any)?.name;
    const tossWinnerName = tossWinnerId === match.team_a_id ? teamAName : tossWinnerId === match.team_b_id ? teamBName : null;

    return (
      <div className={cn('bg-card rounded-xl border p-4 transition-all', isLive && 'border-status-live border-2 shadow-lg shadow-status-live/10')}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{match.event_sport?.sport_category?.icon}</span>
            <span className="text-sm font-medium text-muted-foreground">{match.event_sport?.sport_category?.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {phase && phase !== 'not_started' && isLive && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium capitalize">{phase.replace(/_/g, ' ')}</span>
            )}
            {match.phase && <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">{match.phase}</span>}
            <StatusBadge status={match.status} />
          </div>
        </div>

        {match.round && (
          <p className="text-xs text-muted-foreground mb-2">{match.round}{match.group_name ? ` — Group ${match.group_name}` : ''}</p>
        )}

        {/* Toss info */}
        {tossWinnerName && isCricket && (
          <p className="text-center text-xs text-muted-foreground mb-2">
            🪙 {tossWinnerName} won toss — <span className="capitalize">{tossDecision}</span> first
          </p>
        )}

        {/* Cricket target */}
        {isCricket && isLive && target && (
          <div className="text-center text-xs font-medium text-accent mb-2 p-1.5 rounded bg-accent/10">
            Target: {target} | Need {Math.max(0, target - scoreB)} runs
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex-1 text-center">
            <p className={cn('font-semibold', winnerId === match.team_a_id && 'text-accent')}>{match.team_a?.name || 'TBD'}</p>
            <p className="text-xs text-muted-foreground">{match.team_a?.university?.short_name}</p>
            {isCricket ? (
              <div className="mt-1">
                <p className="text-2xl font-display font-bold">{scoreA}/{wicketsA}</p>
                <p className="text-xs text-muted-foreground">{Math.floor(ballsA / 6)}.{ballsA % 6} ov</p>
              </div>
            ) : null}
          </div>
          <div className="px-4">
            {isCricket ? (
              <span className="text-xl text-muted-foreground">vs</span>
            ) : (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-3">
                  <span className={cn('text-3xl font-display font-bold', scoreA > scoreB && 'text-accent')}>{scoreA}</span>
                  <span className="text-xl text-muted-foreground">-</span>
                  <span className={cn('text-3xl font-display font-bold', scoreB > scoreA && 'text-accent')}>{scoreB}</span>
                </div>
                {((match as any).penalty_a > 0 || (match as any).penalty_b > 0) && (
                  <p className="text-xs text-muted-foreground mt-0.5">({(match as any).penalty_a}-{(match as any).penalty_b} pen.)</p>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 text-center">
            <p className={cn('font-semibold', winnerId === match.team_b_id && 'text-accent')}>{match.team_b?.name || 'TBD'}</p>
            <p className="text-xs text-muted-foreground">{match.team_b?.university?.short_name}</p>
            {isCricket ? (
              <div className="mt-1">
                <p className="text-2xl font-display font-bold">{scoreB}/{wicketsB}</p>
                <p className="text-xs text-muted-foreground">{Math.floor(ballsB / 6)}.{ballsB % 6} ov</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Run rate for cricket */}
        {isCricket && isLive && (() => {
          const activeRuns = innings === 2 ? scoreB : scoreA;
          const activeBalls = innings === 2 ? ballsB : ballsA;
          const rr = activeBalls > 0 ? (activeRuns / (activeBalls / 6)).toFixed(2) : '0.00';
          const rrr = innings === 2 && target
            ? (() => { const need = target - scoreB; const bl = 120 - ballsB; return bl > 0 ? (need / (bl / 6)).toFixed(2) : '∞'; })()
            : null;
          return (
            <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>RR: {rr}</span>
              {rrr && <span>RRR: {rrr}</span>}
            </div>
          );
        })()}

        {winnerId && (match.status === 'finalized' || match.status === 'completed_provisional') && (() => {
          const winnerName = winnerId === match.team_a_id ? teamAName : teamBName;
          let resultText = `🏆 Winner: ${winnerName}`;
          if (isCricket) {
            if (winnerId === match.team_a_id) {
              resultText = `🏆 ${teamAName} won by ${scoreA - scoreB} runs`;
            } else {
              resultText = `🏆 ${teamBName} won by ${10 - wicketsB} wickets`;
            }
          }
          return (
            <p className="text-xs font-semibold text-accent text-center mt-3 pt-3 border-t border-border">
              {resultText}
              {match.result_status === 'advanced' && ' — ➡ Advanced'}
            </p>
          );
        })()}

        {match.venue && !match.winner_team_id && (
          <p className="text-xs text-muted-foreground text-center mt-3 pt-3 border-t border-border">📍 {match.venue.name}</p>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading scoreboard...</p>
        </div>
      </div>
    );
  }

  const hasBracket = bracketEvents.length > 0;
  const hasStandings = standingsEvents.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="hero-gradient text-primary-foreground py-16 px-4">
        <div className="container mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl accent-gradient shadow-accent mb-4">
            <Trophy className="w-8 h-8" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-display font-bold mb-4">Athletix</h1>
          <p className="text-lg text-primary-foreground/70 mb-8 max-w-xl mx-auto">
            Live scores, brackets, standings, and results from university sports events
          </p>
          <Link to="/auth">
            <Button size="lg" className="accent-gradient text-accent-foreground shadow-accent">
              Sign In to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="live" className="space-y-6">
          <TabsList className={cn('grid w-full max-w-lg mx-auto', `grid-cols-${3 + (hasBracket ? 1 : 0) + (hasStandings ? 1 : 0)}`)}>
            <TabsTrigger value="live" className="relative">
              Live
              {liveMatches.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-status-live rounded-full animate-pulse" />}
            </TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            {hasBracket && <TabsTrigger value="bracket">Bracket</TabsTrigger>}
            {hasStandings && <TabsTrigger value="standings">Standings</TabsTrigger>}
            <TabsTrigger value="events">Events</TabsTrigger>
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
                {liveMatches.map(match => <MatchCard key={match.id} match={match} />)}
              </div>
            ) : (
              <div className="text-center py-12">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No live matches</h3>
                <p className="text-muted-foreground">Check back later for live action!</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold">Recent Results</h2>
              <p className="text-muted-foreground">Latest finalized matches</p>
            </div>
            {recentMatches.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentMatches.map(match => <MatchCard key={match.id} match={match} />)}
              </div>
            ) : (
              <div className="text-center py-12">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No results yet</h3>
                <p className="text-muted-foreground">Match results will appear here</p>
              </div>
            )}
          </TabsContent>

          {hasBracket && (
            <TabsContent value="bracket" className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-display font-bold">🏆 Knockout Bracket</h2>
                <p className="text-muted-foreground">Tournament bracket view</p>
              </div>
              {bracketEvents.length > 1 && (
                <Select value={selectedBracketSportId} onValueChange={setSelectedBracketSportId}>
                  <SelectTrigger className="w-64 mx-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {bracketEvents.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.sport_category?.icon} {s.sport_category?.name} — {s.event?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedBracketSportId && <BracketView eventSportId={selectedBracketSportId} />}
            </TabsContent>
          )}

          {hasStandings && (
            <TabsContent value="standings" className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-display font-bold">📊 Standings</h2>
                <p className="text-muted-foreground">Group & league standings</p>
              </div>
              {standingsEvents.length > 1 && (
                <Select value={selectedStandingsSportId} onValueChange={setSelectedStandingsSportId}>
                  <SelectTrigger className="w-64 mx-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {standingsEvents.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.sport_category?.icon} {s.sport_category?.name} — {s.event?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedStandingsSportId && <StandingsTable eventSportId={selectedStandingsSportId} />}
            </TabsContent>
          )}

          <TabsContent value="events" className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold">Upcoming Events</h2>
              <p className="text-muted-foreground">Sports events you can participate in</p>
            </div>
            {upcomingEvents.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingEvents.map(event => (
                  <div key={event.id} className="bg-card rounded-xl border overflow-hidden">
                    <div className="h-24 bg-gradient-to-br from-primary via-primary/80 to-accent/50 relative">
                      {event.banner_url && (
                        <img src={event.banner_url} alt={event.name} className="w-full h-full object-cover opacity-50" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4">
                        <h3 className="font-display font-bold text-white truncate">{event.name}</h3>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <StatusBadge status={event.status} />
                        <div className="flex items-center gap-2">
                          {event.tournament_type && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium capitalize">
                              {event.tournament_type}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{event.university?.short_name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {format(new Date(event.start_date), 'MMM d')} - {format(new Date(event.end_date), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No upcoming events</h3>
                <p className="text-muted-foreground">Check back later for new events</p>
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
