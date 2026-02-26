import { Match } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';
import { getTeamScores } from '@/lib/match-scoring';

interface LiveMatchCardProps {
  match: Match;
  className?: string;
}

export function LiveMatchCard({ match, className }: LiveMatchCardProps) {
  const { teamAScore, teamBScore } = getTeamScores(match);
  const participantAName = match.participant_a_name || match.participant_a?.name || match.team_a?.name || 'TBD';
  const participantBName = match.participant_b_name || match.participant_b?.name || match.team_b?.name || 'TBD';

  return (
    <div className={cn('dashboard-card p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{match.event_sport?.sport_category?.icon}</span>
          <span className="text-sm font-medium text-muted-foreground">
            {match.event_sport?.sport_category?.name}
          </span>
        </div>
        <StatusBadge status={match.status} />
      </div>

      <div className="flex items-center justify-between">
        {/* Team A */}
        <div className="flex-1 text-center">
          <p className="font-semibold truncate">{participantAName}</p>
          <p className="text-xs text-muted-foreground truncate">
            {match.team_a?.university?.short_name}
          </p>
        </div>

        {/* Score */}
        <div className="px-6">
          <div className="flex items-center gap-3">
            <span className={cn(
              'text-3xl font-display font-bold',
              teamAScore > teamBScore && 'text-accent'
            )}>
              {teamAScore}
            </span>
            <span className="text-xl text-muted-foreground">-</span>
            <span className={cn(
              'text-3xl font-display font-bold',
              teamBScore > teamAScore && 'text-accent'
            )}>
              {teamBScore}
            </span>
          </div>
        </div>

        {/* Team B */}
        <div className="flex-1 text-center">
          <p className="font-semibold truncate">{participantBName}</p>
          <p className="text-xs text-muted-foreground truncate">
            {match.team_b?.university?.short_name}
          </p>
        </div>
      </div>

      {match.venue && (
        <p className="text-xs text-muted-foreground text-center mt-3">
          📍 {match.venue.name}
        </p>
      )}
    </div>
  );
}
