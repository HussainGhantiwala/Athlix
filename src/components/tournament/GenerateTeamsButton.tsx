import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Event } from '@/types/database';
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
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Users } from 'lucide-react';
import { EventSportConfig, getEventSportsFromApprovedForms } from '@/lib/eventSportConfig';
import { generateTeamsForEvent } from '@/services/eventTestingService';

interface GenerateTeamsButtonProps {
  event: Event;
  onGenerated: () => void;
}

function getDefaultTeamSize(sport?: EventSportConfig['sport_category'] | null) {
  if (sport?.min_team_size && sport.min_team_size > 0) {
    return sport.min_team_size;
  }

  const sportName = sport?.name?.toLowerCase() || '';
  if (['football', 'cricket', 'hockey'].includes(sportName)) {
    return 11;
  }

  return 5;
}

async function loadEventSports(eventId: string) {
  const { data, error } = await supabase
    .from('event_sports')
    .select('id, event_id, sport_category_id, sport_category:sports_categories(name, icon, is_team_sport, min_team_size, max_team_size)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  if (data && data.length > 0) {
    return data as unknown as EventSportConfig[];
  }

  const { eventSports } = await getEventSportsFromApprovedForms(eventId);
  return eventSports;
}

export default function GenerateTeamsButton({ event, onGenerated }: GenerateTeamsButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [eventSports, setEventSports] = useState<EventSportConfig[]>([]);
  const [selectedSportId, setSelectedSportId] = useState('');
  const [teamSize, setTeamSize] = useState('5');
  const [generating, setGenerating] = useState(false);

  const selectedSport = eventSports.find((sport) => sport.id === selectedSportId);
  const maxTeamSize = selectedSport?.sport_category?.max_team_size || 30;

  const handleOpen = async () => {
    try {
      const sports = await loadEventSports(event.id);

      if (!sports.length) {
        toast.error('No sports configured for this event yet.');
        return;
      }

      setEventSports(sports);
      setSelectedSportId('');
      setTeamSize(String(getDefaultTeamSize(sports[0]?.sport_category)));
      setOpen(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load event sports');
    }
  };

  const handleSportChange = (sportId: string) => {
    setSelectedSportId(sportId);
    const sport = eventSports.find((item) => item.id === sportId);
    setTeamSize(String(getDefaultTeamSize(sport?.sport_category)));
  };

  const performGeneration = async (replaceExisting: boolean) => {
    const parsedTeamSize = Number(teamSize);

    if (!selectedSportId) {
      toast.error('Please select a sport');
      return;
    }

    if (!Number.isInteger(parsedTeamSize) || parsedTeamSize < 1) {
      toast.error('Please enter a valid team size');
      return;
    }

    setGenerating(true);

    try {
      const result = await generateTeamsForEvent({
        eventId: event.id,
        eventSportId: selectedSportId,
        teamSize: parsedTeamSize,
        replaceExisting,
      });

      toast.success(result.message);
      setConfirmReplaceOpen(false);
      setOpen(false);
      onGenerated();
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate teams');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateClick = async () => {
    if (!selectedSportId) {
      toast.error('Please select a sport');
      return;
    }

    const { count, error } = await supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('event_sport_id', selectedSportId);

    if (error) {
      toast.error('Failed to check existing teams');
      return;
    }

    if ((count || 0) > 0) {
      setConfirmReplaceOpen(true);
      return;
    }

    await performGeneration(false);
  };

  return (
    <>
      <Button onClick={handleOpen}>
        <Users className="h-4 w-4 mr-2" />
        Generate Teams
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Teams for {event.name}</DialogTitle>
            <DialogDescription>
              Testing only. This creates shuffled dummy players and evenly balanced teams, capped at 8 teams.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Sport</Label>
              <Select value={selectedSportId} onValueChange={handleSportChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sport" />
                </SelectTrigger>
                <SelectContent>
                  {eventSports.map((eventSport) => (
                    <SelectItem key={eventSport.id} value={eventSport.id}>
                      {eventSport.sport_category?.icon} {eventSport.sport_category?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="team-size">Team Size</Label>
              <Input
                id="team-size"
                type="number"
                min={1}
                max={maxTeamSize}
                value={teamSize}
                onChange={(event) => setTeamSize(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Default comes from the selected sport. The generator will create 20-40 dummy players and at least 2 teams.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={handleGenerateClick} disabled={generating || !selectedSportId}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Teams'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Replace Existing Teams
            </DialogTitle>
            <DialogDescription>
              Teams already exist for this sport. Regenerating will delete the old testing teams, related matches, and standings for this sport before creating new ones.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReplaceOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void performGeneration(true)} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                'Delete & Regenerate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
