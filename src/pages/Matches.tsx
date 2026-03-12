import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Match } from '@/types/database';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, Target, Edit2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function Matches() {
  const navigate = useNavigate();
  const { isStudentCoordinator } = useAuth();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchMatches();
  }, [statusFilter]);

  const fetchMatches = async () => {
    setLoading(true);
    let query = supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(id, name, university:universities(short_name)),
        team_b:teams!matches_team_b_id_fkey(id, name, university:universities(short_name)),
        venue:venues(name),
        event_sport:event_sports(
          sport_category:sports_categories(name, icon),
          event:events(name)
        )
      `)
      .order('scheduled_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as any);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to fetch matches');
    } else {
      setMatches((data as unknown as Match[]) || []);
    }
    setLoading(false);
  };

  const filteredMatches = matches.filter((match) =>
    match.team_a?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    match.team_b?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    match.event_sport?.sport_category?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Matches</h1>
          <p className="text-muted-foreground">View and manage match scores</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search matches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="completed">Finished</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : filteredMatches.length > 0 ? (
          <div className="space-y-4">
            {filteredMatches.map((match) => {
              const scoreA = match.score_a ?? match.runs_a ?? 0;
              const scoreB = match.score_b ?? match.runs_b ?? 0;
              const winnerName = match.winner_team_id === match.team_a_id
                ? match.team_a?.name
                : match.winner_team_id === match.team_b_id
                ? match.team_b?.name
                : null;

              return (
                <div
                  key={match.id}
                  className={cn(
                    'dashboard-card p-4',
                    match.status === 'live' && 'border-status-live border-2'
                  )}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex items-center gap-3 lg:w-56">
                      <span className="text-2xl">{match.event_sport?.sport_category?.icon}</span>
                      <div>
                        <p className="font-medium">{match.event_sport?.sport_category?.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {match.event_sport?.event?.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center gap-4">
                      <div className="text-right flex-1">
                        <p className="font-semibold">{match.team_a?.name || 'TBD'}</p>
                        <p className="text-xs text-muted-foreground">{match.team_a?.university?.short_name}</p>
                      </div>

                      <div className="flex items-center gap-3 px-4">
                        <span className={cn('text-2xl font-display font-bold', scoreA > scoreB && 'text-accent')}>
                          {scoreA}
                        </span>
                        <span className="text-muted-foreground">-</span>
                        <span className={cn('text-2xl font-display font-bold', scoreB > scoreA && 'text-accent')}>
                          {scoreB}
                        </span>
                      </div>

                      <div className="text-left flex-1">
                        <p className="font-semibold">{match.team_b?.name || 'TBD'}</p>
                        <p className="text-xs text-muted-foreground">{match.team_b?.university?.short_name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 lg:w-64 justify-end">
                      <div className="text-right mr-2">
                        <StatusBadge status={match.status} />
                        <p className="text-xs text-muted-foreground mt-1">
                          <Clock className="inline h-3 w-3 mr-1" />
                          {format(new Date(match.scheduled_at), 'MMM d, HH:mm')}
                        </p>
                      </div>

                      {match.status === 'live' && isStudentCoordinator && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/coordinator/score-control?match=${match.id}`)}
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Score
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    {match.venue && <p className="text-xs text-muted-foreground">Venue: {match.venue.name}</p>}
                    {match.status === 'completed' && <span className="text-xs font-semibold text-primary">Finished</span>}
                    {winnerName && match.status === 'completed' && (
                      <span className="text-xs font-semibold text-accent">Winner: {winnerName}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No matches found</h3>
            <p className="text-muted-foreground">
              {searchQuery ? 'Try adjusting your search query' : 'Matches will appear here once scheduled'}
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
