import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function roleLabel(role: string) {
  return role.replace('_', ' ');
}

export function PendingInvitesDialog() {
  const { pendingInvites, acceptInvite, rejectInvite, loading } = useAuth();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const open = useMemo(() => !loading && pendingInvites.length > 0, [loading, pendingInvites.length]);

  const handleAccept = async (inviteId: string) => {
    setSubmittingId(inviteId);
    const { error } = await acceptInvite(inviteId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Invite accepted. Your university access has been updated.');
    }
    setSubmittingId(null);
  };

  const handleReject = async (inviteId: string) => {
    setSubmittingId(inviteId);
    const { error } = await rejectInvite(inviteId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Invite dismissed.');
    }
    setSubmittingId(null);
  };

  if (!open) {
    return null;
  }

  return (
    <Dialog open>
      <DialogContent onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Pending University Invite</DialogTitle>
          <DialogDescription>
            Choose which invite you want to accept before continuing to your dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {pendingInvites.map((invite) => (
            <div key={invite.id} className="rounded-xl border border-border p-4">
              <p className="font-medium">{invite.university?.name || 'University invite'}</p>
              <p className="text-sm text-muted-foreground capitalize">{roleLabel(invite.role)}</p>
              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => handleReject(invite.id)}
                  disabled={submittingId === invite.id}
                >
                  Reject
                </Button>
                <Button onClick={() => handleAccept(invite.id)} disabled={submittingId === invite.id}>
                  Accept
                </Button>
              </DialogFooter>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
