import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Match, MatchStatusEnum } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, MapPin, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { TournamentBracket } from '@/components/matches/TournamentBracket';
import { getSportKey, getTeamScores, normalizeScoreData, formatCricketScoreLine } from '@/lib/match-scoring';
import { isCricketScoreData } from '@/types/match-scoring';

export default function PublicMatchView() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<Match | null>(null);

  const fetchMatch = async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(name, short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(name, short_name)),
        venue:venues(name, location),
        event_sport:event_sports(
          id,
          match_format,
          event:events(name),
          sport_category:sports_categories(name, icon)
        )
      `)
      .eq('id', id)
      .maybeSingle();

    setMatch((data as unknown as Match) || null);
    setLoading(false);
  };

  useEffect(() => {
    fetchMatch();
    if (!id) return;

    const channel = supabase
      .channel(`public-match-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${id}` }, fetchMatch)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const scoreSummary = useMemo(() => {
    if (!match) return null;
    const normalized = normalizeScoreData(match);
    if (isCricketScoreData(normalized)) {
      return formatCricketScoreLine(normalized);
    }
    return null;
  }, [match]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="container mx-auto px-4 py-12 text-center space-y-3">
        <h1 className="text-2xl font-display font-bold">Match Not Found</h1>
        <p className="text-muted-foreground">This match does not exist or is not publicly visible.</p>
        <Link to="/">
          <Button>Back to Scoreboard</Button>
        </Link>
      </div>
    );
  }

  const { teamAScore, teamBScore } = getTeamScores(match);
  const winnerId = match.winner_id || match.winner_team_id;
  const winnerName =
    match.status === MatchStatusEnum.Completed
      ? winnerId === match.team_a_id
        ? match.team_a?.name
        : winnerId === match.team_b_id
          ? match.team_b?.name
          : 'Draw'
      : null;
  const isKnockout = match.event_sport?.match_format?.toLowerCase().includes('knockout');

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">Match View</h1>
            <p className="text-muted-foreground">
              {match.event_sport?.event?.name} | {match.event_sport?.sport_category?.icon} {match.event_sport?.sport_category?.name}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/">
              <Button variant="outline">Public Scoreboard</Button>
            </Link>
            <Link to="/auth">
              <Button>Sign In</Button>
            </Link>
          </div>
        </div>

        <div className="dashboard-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <StatusBadge status={match.status} />
            {match.round && (
              <span className="text-sm text-muted-foreground">
                {String(match.round).replace(/_/g, ' ').toUpperCase()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 items-center gap-3">
            <div className="text-center">
              <p className="font-semibold">{match.team_a?.name || 'TBD'}</p>
              <p className="text-xs text-muted-foreground">{match.team_a?.university?.short_name}</p>
              <p className="text-4xl font-display font-bold mt-2">{teamAScore}</p>
            </div>
            <div className="text-center text-muted-foreground">vs</div>
            <div className="text-center">
              <p className="font-semibold">{match.team_b?.name || 'TBD'}</p>
              <p className="text-xs text-muted-foreground">{match.team_b?.university?.short_name}</p>
              <p className="text-4xl font-display font-bold mt-2">{teamBScore}</p>
            </div>
          </div>

          {scoreSummary && getSportKey(match) === 'cricket' && (
            <div className="text-sm text-muted-foreground text-center">
              Live scoreboard: {scoreSummary}
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2 border-t border-border">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {format(new Date(match.scheduled_at), 'MMM d, yyyy HH:mm')}
            </span>
            {match.venue?.name && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {match.venue.name}
              </span>
            )}
          </div>

          {winnerName && (
            <div className="bg-muted rounded-lg p-3 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <Trophy className="h-4 w-4 text-accent" />
                Winner: {winnerName}
              </span>
            </div>
          )}
        </div>

        {isKnockout && match.event_sport_id && (
          <div className="dashboard-card p-6">
            <TournamentBracket eventSportId={match.event_sport_id} highlightMatchId={match.id} />
          </div>
        )}
      </div>
    </div>
  );
}
