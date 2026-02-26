import { cn } from '@/lib/utils';
import { MatchStatus, EventStatus, TeamStatus, BudgetStatus, RegistrationStatus } from '@/types/database';

type StatusType = MatchStatus | EventStatus | TeamStatus | BudgetStatus | RegistrationStatus;

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  // Match statuses
  scheduled: { label: 'Scheduled', className: 'bg-muted text-muted-foreground' },
  live: { label: 'LIVE', className: 'bg-status-live text-white animate-pulse-slow' },
  paused: { label: 'Paused', className: 'bg-status-provisional text-white' },
  completed_provisional: { label: 'Provisional', className: 'bg-status-provisional text-white' },
  finalized: { label: 'Finalized', className: 'bg-status-finalized text-white' },
  cancelled: { label: 'Cancelled', className: 'bg-status-cancelled text-white' },
  
  // Event statuses
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  pending_approval: { label: 'Pending', className: 'bg-status-provisional text-white' },
  approved: { label: 'Approved', className: 'bg-status-finalized text-white' },
  active: { label: 'Active', className: 'bg-status-live text-white' },
  completed: { label: 'Completed', className: 'bg-primary text-primary-foreground' },
  
  // Team statuses
  forming: { label: 'Forming', className: 'bg-muted text-muted-foreground' },
  // pending_approval already defined above
  // approved already defined above
  locked: { label: 'Locked', className: 'bg-primary text-primary-foreground' },
  
  // Budget statuses
  // draft already defined above
  submitted: { label: 'Submitted', className: 'bg-status-provisional text-white' },
  // approved already defined above
  rejected: { label: 'Rejected', className: 'bg-status-cancelled text-white' },
  
  // Registration statuses
  pending: { label: 'Pending', className: 'bg-status-provisional text-white' },
  // approved already defined above
  // rejected already defined above
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  if (!config) {
    return (
      <span className={cn('px-2.5 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground', className)}>
        {status}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full',
        config.className,
        className
      )}
    >
      {status === 'live' && (
        <span className="w-1.5 h-1.5 bg-white rounded-full mr-1.5" />
      )}
      {config.label}
    </span>
  );
}
