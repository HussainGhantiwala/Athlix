import { useState } from 'react';
import { TournamentType } from '@/types/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Trophy, Users, BarChart3 } from 'lucide-react';

interface TournamentTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: TournamentType) => void;
  loading?: boolean;
}

const types: { value: TournamentType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'knockout',
    label: 'Knockout',
    description: 'Single elimination bracket. Losers are eliminated. Winners advance to next round.',
    icon: <Trophy className="h-6 w-6" />,
  },
  {
    value: 'group',
    label: 'Group Stage',
    description: 'Teams split into groups with round robin. Top 2 per group advance to knockout.',
    icon: <Users className="h-6 w-6" />,
  },
  {
    value: 'league',
    label: 'League (Round Robin)',
    description: 'Every team plays every other team. Points decide the champion. No elimination.',
    icon: <BarChart3 className="h-6 w-6" />,
  },
];

export default function TournamentTypeModal({ open, onOpenChange, onSelect, loading }: TournamentTypeModalProps) {
  const [selected, setSelected] = useState<TournamentType | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Tournament Type</DialogTitle>
          <DialogDescription>Choose the format for match generation</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {types.map((t) => (
            <button
              key={t.value}
              onClick={() => setSelected(t.value)}
              className={cn(
                'w-full flex items-start gap-4 p-4 rounded-lg border transition-all text-left',
                selected === t.value
                  ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                  : 'border-border hover:border-muted-foreground/30'
              )}
            >
              <div className={cn(
                'w-12 h-12 rounded-lg flex items-center justify-center shrink-0',
                selected === t.value ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
              )}>
                {t.icon}
              </div>
              <div>
                <p className="font-semibold">{t.label}</p>
                <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
              </div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!selected || loading}
            onClick={() => selected && onSelect(selected)}
          >
            {loading ? 'Generating...' : 'Generate Matches'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
