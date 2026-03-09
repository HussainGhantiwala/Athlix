import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface TossModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamAName: string;
  teamBName: string;
  teamAId: string;
  teamBId: string;
  onConfirm: (tossWinnerId: string, tossDecision: 'bat' | 'bowl', battingTeamId: string, bowlingTeamId: string) => Promise<void>;
}

export default function TossModal({ open, onOpenChange, teamAName, teamBName, teamAId, teamBId, onConfirm }: TossModalProps) {
  const [tossWinnerId, setTossWinnerId] = useState<string | null>(null);
  const [tossDecision, setTossDecision] = useState<'bat' | 'bowl' | null>(null);
  const [loading, setLoading] = useState(false);

  const tossWinnerName = tossWinnerId === teamAId ? teamAName : tossWinnerId === teamBId ? teamBName : null;

  const handleConfirm = async () => {
    if (!tossWinnerId || !tossDecision) return;
    const opponentId = tossWinnerId === teamAId ? teamBId : teamAId;
    const battingTeamId = tossDecision === 'bat' ? tossWinnerId : opponentId;
    const bowlingTeamId = tossDecision === 'bowl' ? tossWinnerId : opponentId;

    setLoading(true);
    await onConfirm(tossWinnerId, tossDecision, battingTeamId, bowlingTeamId);
    setLoading(false);
    setTossWinnerId(null);
    setTossDecision(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🪙 Toss</DialogTitle>
          <DialogDescription>Select the toss winner and their decision to start the match.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Step 1: Toss Winner */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Who won the toss?</Label>
            <div className="grid grid-cols-2 gap-3">
              {[{ id: teamAId, name: teamAName }, { id: teamBId, name: teamBName }].map(team => (
                <button
                  key={team.id}
                  onClick={() => { setTossWinnerId(team.id); setTossDecision(null); }}
                  className={cn(
                    'p-4 rounded-xl border-2 text-center font-semibold transition-all',
                    tossWinnerId === team.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {team.name}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Decision */}
          {tossWinnerId && (
            <div className="space-y-3 animate-fade-in">
              <Label className="text-sm font-semibold">{tossWinnerName} chose to:</Label>
              <div className="grid grid-cols-2 gap-3">
                {(['bat', 'bowl'] as const).map(decision => (
                  <button
                    key={decision}
                    onClick={() => setTossDecision(decision)}
                    className={cn(
                      'p-4 rounded-xl border-2 text-center font-semibold capitalize transition-all',
                      tossDecision === decision
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border hover:border-accent/50'
                    )}
                  >
                    {decision === 'bat' ? '🏏 Bat First' : '🎯 Bowl First'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {tossWinnerId && tossDecision && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm text-center space-y-1 animate-fade-in">
              <p className="font-semibold">{tossWinnerName} won the toss</p>
              <p className="text-muted-foreground">
                Decision: <span className="capitalize font-medium">{tossDecision} first</span>
              </p>
              <p className="text-muted-foreground">
                Batting: <span className="font-medium">{tossDecision === 'bat' ? tossWinnerName : (tossWinnerId === teamAId ? teamBName : teamAName)}</span>
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={!tossWinnerId || !tossDecision || loading}
            onClick={handleConfirm}
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Start Match
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
