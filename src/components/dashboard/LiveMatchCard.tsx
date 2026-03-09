import { Match, Score } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

interface LiveMatchCardProps {
  match: Match;
  className?: string;
}

export function LiveMatchCard({ match, className }: LiveMatchCardProps) {
  const teamAScore = match.scores?.find((s) => s.team_id === match.team_a_id)?.score_value ?? 0;
  const teamBScore = match.scores?.find((s) => s.team_id === match.team_b_id)?.score_value ?? 0;

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
          <p className="font-semibold truncate">{match.team_a?.name || 'TBD'}</p>
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
          <p className="font-semibold truncate">{match.team_b?.name || 'TBD'}</p>
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
