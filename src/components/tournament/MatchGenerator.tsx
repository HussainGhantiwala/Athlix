import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TournamentType, Team, Event } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TournamentTypeModal from './TournamentTypeModal';
import { toast } from 'sonner';
import { Zap, AlertTriangle } from 'lucide-react';
import {
  generateKnockoutMatches,
  generateGroupMatches,
  generateLeagueMatches,
} from '@/lib/tournament-engine';
import { getEventSportsFromApprovedForms } from '@/lib/eventSportConfig';

interface MatchGeneratorProps {
  event: Event;
  onGenerated: () => void;
}

export default function MatchGenerator({ event, onGenerated }: MatchGeneratorProps) {
  const { user } = useAuth();
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showSportSelect, setShowSportSelect] = useState(false);
  const [eventSports, setEventSports] = useState<any[]>([]);
  const [selectedSportId, setSelectedSportId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const handleOpenGenerator = async () => {
    try {
      const { forms, eventSports: sportsFromForms } = await getEventSportsFromApprovedForms(event.id);

      if (!forms || forms.length === 0) {
        toast.error('No approved registration forms found. Approve a form before generating matches.');
        return;
      }

      if (!sportsFromForms || sportsFromForms.length === 0) {
        toast.error('No sports available from approved registration forms.');
        return;
      }

      setEventSports(sportsFromForms);
      setSelectedSportId('');
      setShowSportSelect(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load approved registration forms');
      return;
    }
  };

  const handleProceedToType = () => {
    if (!selectedSportId || !scheduledAt) {
      toast.error('Please select a sport and schedule date');
      return;
    }
    setShowSportSelect(false);
    setShowTypeModal(true);
  };

  const handleGenerate = async (type: TournamentType) => {
    if (!user?.id) return;
    setGenerating(true);

    try {
      // Check for existing matches
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('id')
        .eq('event_sport_id', selectedSportId)
        .limit(1);

      if (existingMatches && existingMatches.length > 0 && !confirmWipe) {
        setConfirmWipe(true);
        setGenerating(false);
        return;
      }

      // Wipe existing matches if confirmed
      if (confirmWipe) {
        await supabase.from('scores').delete().in(
          'match_id',
          (await supabase.from('matches').select('id').eq('event_sport_id', selectedSportId)).data?.map(m => m.id) || []
        );
        await supabase.from('matches').delete().eq('event_sport_id', selectedSportId);
        await supabase.from('team_standings').delete().eq('event_sport_id', selectedSportId);
        setConfirmWipe(false);
      }

      // Save tournament type on event
      await supabase.from('events').update({ tournament_type: type }).eq('id', event.id);

      // Fetch teams for this sport
      const { data: teams } = await supabase
        .from('teams')
        .select('*')
        .eq('event_sport_id', selectedSportId)
        .in('status', ['approved', 'locked']);

      if (!teams || teams.length < 2) {
        toast.error('Not enough approved teams to generate matches.');
        setGenerating(false);
        return;
      }

      let result;
      switch (type) {
        case 'knockout':
          result = await generateKnockoutMatches(selectedSportId, event.id, teams as Team[], user.id, scheduledAt);
          break;
        case 'group':
          result = await generateGroupMatches(selectedSportId, event.id, teams as Team[], user.id, scheduledAt);
          break;
        case 'league':
          result = await generateLeagueMatches(selectedSportId, event.id, teams as Team[], user.id, scheduledAt);
          break;
      }

      if (result.success) {
        toast.success(`Generated ${result.matchCount} matches (${type})`);
        onGenerated();
      } else {
        toast.error(result.error || 'Failed to generate matches');
      }
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
    }

    setShowTypeModal(false);
    setGenerating(false);
  };

  return (
    <>
      <Button onClick={handleOpenGenerator}>
        <Zap className="h-4 w-4 mr-2" />
        Generate Matches
      </Button>

      {/* Sport Selection Dialog */}
      <Dialog open={showSportSelect} onOpenChange={setShowSportSelect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Matches for {event.name}</DialogTitle>
            <DialogDescription>Select a sport and schedule time</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Sport</Label>
              <Select value={selectedSportId} onValueChange={setSelectedSportId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sport" />
                </SelectTrigger>
                <SelectContent>
                  {eventSports.map(es => (
                    <SelectItem key={es.id} value={es.id}>
                      {es.sport_category?.icon} {es.sport_category?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Schedule Start</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSportSelect(false)}>Cancel</Button>
            <Button onClick={handleProceedToType}>Next: Select Format</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tournament Type Modal */}
      <TournamentTypeModal
        open={showTypeModal}
        onOpenChange={setShowTypeModal}
        onSelect={handleGenerate}
        loading={generating}
      />

      {/* Confirm Wipe Dialog */}
      <Dialog open={confirmWipe} onOpenChange={setConfirmWipe}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Existing Matches Found
            </DialogTitle>
            <DialogDescription>
              This sport already has matches. Regenerating will delete ALL existing matches and scores for this sport. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmWipe(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setShowTypeModal(true); setConfirmWipe(false); }}>
              Delete & Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
