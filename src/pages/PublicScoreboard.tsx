import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Match, Event } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Calendar, Target, Users, ArrowRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { getTeamScores } from '@/lib/match-scoring';

export default function PublicScoreboard() {
  const [loading, setLoading] = useState(true);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);

  useEffect(() => {
    fetchData();

    // Realtime subscription for live updates
    const channel = supabase
      .channel('public-scoreboard')
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
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchMatches(), fetchEvents()]);
    setLoading(false);
  };

  const fetchMatches = async () => {
    // Live matches
    const { data: live } = await supabase
      .from('matches')
      .select(`
        id,
        status,
        scheduled_at,
        started_at,
        participant_a_name,
        participant_b_name,
        score_data,
        team_a_id,
        team_b_id,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        venue:venues(name),
        event_sport:event_sports(sport_category:sports_categories(name, icon)),
        scores(*)
      `)
      .eq('status', 'live')
      .order('started_at', { ascending: false });

    console.log(live);
    setLiveMatches((live as unknown as Match[]) || []);

    // Recent finalized matches
    const { data: recent } = await supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        venue:venues(name),
        event_sport:event_sports(sport_category:sports_categories(name, icon)),
        scores(*)
      `)
      .eq('status', 'finalized')
      .order('finalized_at', { ascending: false })
      .limit(10);

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

  const MatchCard = ({ match }: { match: Match }) => {
    const { teamAScore: scoreA, teamBScore: scoreB } = getTeamScores(match);
    const isLive = match.status === 'live';
    const participantAName = match.participant_a_name ?? match.team_a?.name ?? 'Team A';
    const participantBName = match.participant_b_name ?? match.team_b?.name ?? 'Team B';

    return (
      <Link
        to={`/matches/${match.id}`}
        className={cn(
          'bg-card rounded-xl border p-4 transition-all block',
          isLive && 'border-status-live border-2 shadow-lg shadow-status-live/10'
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{match.event_sport?.sport_category?.icon}</span>
            <span className="text-sm font-medium text-muted-foreground">
              {match.event_sport?.sport_category?.name}
            </span>
          </div>
          <StatusBadge status={match.status} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1 text-center">
            <p className="font-semibold">{participantAName}</p>
            <p className="text-xs text-muted-foreground">{match.team_a?.university?.short_name}</p>
          </div>

          <div className="px-4">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'text-3xl font-display font-bold',
                  scoreA > scoreB && 'text-accent'
                )}
              >
                {scoreA}
              </span>
              <span className="text-xl text-muted-foreground">-</span>
              <span
                className={cn(
                  'text-3xl font-display font-bold',
                  scoreB > scoreA && 'text-accent'
                )}
              >
                {scoreB}
              </span>
            </div>
          </div>

          <div className="flex-1 text-center">
            <p className="font-semibold">{participantBName}</p>
            <p className="text-xs text-muted-foreground">{match.team_b?.university?.short_name}</p>
          </div>
        </div>

        {match.venue && (
          <p className="text-xs text-muted-foreground text-center mt-3 pt-3 border-t border-border">
            📍 {match.venue.name}
          </p>
        )}
      </Link>
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
            Live scores, schedules, and results from university sports events
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
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3">
            <TabsTrigger value="live" className="relative">
              Live
              {liveMatches.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-status-live rounded-full animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
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
                {liveMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
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
                {recentMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No results yet</h3>
                <p className="text-muted-foreground">Match results will appear here</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold">Upcoming Events</h2>
              <p className="text-muted-foreground">Sports events you can participate in</p>
            </div>

            {upcomingEvents.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="bg-card rounded-xl border overflow-hidden">
                    <div className="h-24 bg-gradient-to-br from-primary via-primary/80 to-accent/50 relative">
                      {event.banner_url && (
                        <img
                          src={event.banner_url}
                          alt={event.name}
                          className="w-full h-full object-cover opacity-50"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4">
                        <h3 className="font-display font-bold text-white truncate">
                          {event.name}
                        </h3>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <StatusBadge status={event.status} />
                        <span className="text-xs text-muted-foreground">
                          {event.university?.short_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {format(new Date(event.start_date), 'MMM d')} -{' '}
                          {format(new Date(event.end_date), 'MMM d, yyyy')}
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

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2024 Athletix. University Sports Management System.</p>
        </div>
      </footer>
    </div>
  );
}
