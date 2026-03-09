import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Event } from '@/types/database';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';

interface TournamentResetProps {
  event: Event;
  onReset: () => void;
}

export default function TournamentReset({ event, onReset }: TournamentResetProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Only show in dev mode
  if (import.meta.env.PROD) return null;

  const handleReset = async () => {
    setResetting(true);

    try {
      // 1. Get all event_sports for this event
      const { data: eventSports } = await supabase
        .from('event_sports')
        .select('id')
        .eq('event_id', event.id);

      const eventSportIds = (eventSports || []).map(es => es.id);

      if (eventSportIds.length > 0) {
        // 2. Delete scores for matches in these event_sports
        const { data: matches } = await supabase
          .from('matches')
          .select('id')
          .in('event_sport_id', eventSportIds);

        const matchIds = (matches || []).map(m => m.id);

        if (matchIds.length > 0) {
          await supabase.from('scores').delete().in('match_id', matchIds);
          await supabase.from('score_history').delete().in('match_id', matchIds);
        }

        // 3. Delete matches
        await supabase.from('matches').delete().in('event_sport_id', eventSportIds);

        // 4. Delete team standings
        await supabase.from('team_standings').delete().eq('event_id', event.id);

        // 5. Delete teams
        await supabase.from('team_members').delete().in(
          'team_id',
          ((await supabase.from('teams').select('id').in('event_sport_id', eventSportIds)).data || []).map(t => t.id)
        );
        await supabase.from('teams').delete().in('event_sport_id', eventSportIds);
      }

      // 6. Reset tournament type on event
      await supabase.from('events').update({
        tournament_type: null,
        status: 'active',
      }).eq('id', event.id);

      toast.success('Tournament reset successfully. You can now create new teams and generate matches again.');
      setShowConfirm(false);
      onReset();
    } catch (err: any) {
      toast.error(err.message || 'Reset failed');
    }

    setResetting(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => setShowConfirm(true)}
      >
        <RotateCcw className="h-4 w-4 mr-1" />
        Reset
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reset Tournament — {event.name}
            </DialogTitle>
            <DialogDescription>
              This will delete all teams, matches, scores, and standings for this event.
              This action cannot be undone. Other events will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>
              {resetting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Resetting...</> : 'Reset Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
