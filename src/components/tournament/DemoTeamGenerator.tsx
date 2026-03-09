import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FlaskConical } from 'lucide-react';
import { getEventSportsFromApprovedForms } from '@/lib/eventSportConfig';

const DEMO_TEAM_NAMES = [
  'Thunder Hawks',
  'Iron Titans',
  'Shadow Wolves',
  'Crimson Falcons',
  'Golden Strikers',
  'Storm Breakers',
  'Night Panthers',
  'Royal Warriors',
];

interface DemoTeamGeneratorProps {
  event: Event;
  onGenerated: () => void;
}

export default function DemoTeamGenerator({ event, onGenerated }: DemoTeamGeneratorProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [eventSports, setEventSports] = useState<any[]>([]);
  const [selectedSportId, setSelectedSportId] = useState('');
  const [generating, setGenerating] = useState(false);

  // Only show in development
  if (import.meta.env.PROD) return null;

  const handleOpen = async () => {
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
      setOpen(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load approved registration forms');
      return;
    }
  };

  const handleGenerate = async () => {
    if (!selectedSportId || !user?.id) {
      toast.error('Please select a sport');
      return;
    }

    setGenerating(true);
    try {
      // Check for existing demo teams
      const { data: existing } = await supabase
        .from('teams')
        .select('id')
        .eq('event_sport_id', selectedSportId)
        .in('name', DEMO_TEAM_NAMES)
        .limit(1);

      if (existing && existing.length > 0) {
        toast.error('Demo teams already exist for this event sport.');
        setGenerating(false);
        return;
      }

      // Insert 8 demo teams as approved
      const teamInserts = DEMO_TEAM_NAMES.map(name => ({
        name,
        event_sport_id: selectedSportId,
        status: 'approved' as const,
        created_by: user.id,
      }));

      const { error } = await supabase.from('teams').insert(teamInserts);

      if (error) {
        toast.error('Failed to create demo teams: ' + error.message);
      } else {
        toast.success('8 demo teams created and registered successfully.');
        setOpen(false);
        onGenerated();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate demo teams');
    }
    setGenerating(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        <FlaskConical className="h-4 w-4 mr-1" />
        Demo Teams
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Demo Teams</DialogTitle>
            <DialogDescription>
              Create 8 pre-approved demo teams for testing tournament logic. This is a development-only feature.
            </DialogDescription>
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
            <div className="rounded-lg border border-border p-3 space-y-1">
              <p className="text-sm font-medium">Teams to create:</p>
              <div className="grid grid-cols-2 gap-1">
                {DEMO_TEAM_NAMES.map(name => (
                  <span key={name} className="text-xs text-muted-foreground">• {name}</span>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generating || !selectedSportId}>
              {generating ? 'Creating...' : 'Create 8 Demo Teams'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
