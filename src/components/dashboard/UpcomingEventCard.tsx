import { Event } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { Calendar, MapPin, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface UpcomingEventCardProps {
  event: Event;
  className?: string;
}

export function UpcomingEventCard({ event, className }: UpcomingEventCardProps) {
  return (
    <div className={cn('dashboard-card overflow-hidden group', className)}>
      {/* Banner */}
      <div className="h-24 bg-gradient-to-br from-primary via-primary/80 to-accent/50 relative overflow-hidden">
        {event.banner_url && (
          <img
            src={event.banner_url}
            alt={event.name}
            className="w-full h-full object-cover opacity-50"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="font-display font-bold text-white truncate group-hover:text-accent transition-colors">
            {event.name}
          </h3>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <StatusBadge status={event.status} />
          <span className="text-xs text-muted-foreground">
            {event.university?.short_name}
          </span>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>
              {format(new Date(event.start_date), 'MMM d')} - {format(new Date(event.end_date), 'MMM d, yyyy')}
            </span>
          </div>
          {event.venue && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span className="truncate">{event.venue}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
