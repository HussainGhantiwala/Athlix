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
  teamCount?: number;
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

export default function TournamentTypeModal({ open, onOpenChange, onSelect, loading, teamCount = 0 }: TournamentTypeModalProps) {
  const [selected, setSelected] = useState<TournamentType | null>(null);

  // Power of 2 logic for Knockout
  const getBracketSize = (n: number) => {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  };
  
  const bracketSize = getBracketSize(teamCount);
  const byesNeeded = Math.max(0, bracketSize - teamCount);
  const realR1Matches = teamCount > 0 ? (teamCount - byesNeeded) / 2 : 0;

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
          
          {selected === 'knockout' && teamCount > 0 && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/30 text-sm space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground mb-1">Registered Teams</p>
                  <p className="font-semibold text-lg">{teamCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Bracket Size</p>
                  <p className="font-semibold text-lg">{bracketSize}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">BYEs Needed</p>
                  <p className="font-semibold text-lg">{byesNeeded}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Round 1 Matches</p>
                  <p className="font-semibold text-lg">{realR1Matches}</p>
                </div>
              </div>
              
              <div className="border-t pt-4 grid grid-cols-2 gap-3">
                <label className="flex flex-row items-center space-x-2 cursor-pointer touch-none">
                  <input type="checkbox" className="h-4 w-4 bg-muted border-muted-foreground focus:ring-accent" checked readOnly/>
                  <span className="font-medium">Random Draw</span>
                </label>
                <label className="flex flex-row items-center space-x-2 cursor-pointer touch-none">
                  <input type="checkbox" className="h-4 w-4 bg-muted border-muted-foreground focus:ring-accent" checked readOnly/>
                  <span className="font-medium">Balanced BYEs</span>
                </label>
                <label className="flex flex-row items-center space-x-2 opacity-50 cursor-not-allowed">
                  <input type="checkbox" className="h-4 w-4 bg-muted border-muted-foreground rounded-sm" disabled />
                  <span className="font-medium flex flex-col">Seed Top Teams <span className="text-[10px] text-muted-foreground">Coming Soon</span></span>
                </label>
                <label className="flex flex-row items-center space-x-2 opacity-50 cursor-not-allowed">
                  <input type="checkbox" className="h-4 w-4 bg-muted border-muted-foreground rounded-sm" disabled />
                  <span className="font-medium flex flex-col">Manual Seeding <span className="text-[10px] text-muted-foreground">Coming Soon</span></span>
                </label>
              </div>
            </div>
          )}
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
