import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, MapPin, Clock, CheckCircle } from 'lucide-react';
import { format, isPast } from 'date-fns';

interface EventSportWithDetails {
  id: string;
  event_id: string;
  sport_category_id: string;
  registration_form_status: string;
  registration_deadline: string | null;
  max_participants: number | null;
  eligibility_rules: string | null;
  registration_open: boolean;
  sport_category: { name: string; icon: string | null };
  event: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    venue: string | null;
    status: string;
    university: { name: string; short_name: string } | null;
  };
}

export function UpcomingEventsSection() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [eventSports, setEventSports] = useState<EventSportWithDetails[]>([]);
  const [myRegistrations, setMyRegistrations] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchPublishedEventSports(), fetchMyRegistrations()]);
    setLoading(false);
  };

  const fetchPublishedEventSports = async () => {
    const { data } = await supabase
      .from('event_sports')
      .select(`
        id, event_id, sport_category_id, registration_form_status, registration_deadline,
        max_participants, eligibility_rules, registration_open,
        sport_category:sports_categories(name, icon),
        event:events(id, name, start_date, end_date, venue, status, university:universities(name, short_name))
      `)
      .eq('registration_form_status', 'published' as any)
      .order('created_at', { ascending: false });

    setEventSports((data as unknown as EventSportWithDetails[]) || []);
  };

  const fetchMyRegistrations = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('registration_submissions')
      .select('event_id, sport_id')
      .eq('user_id', user.id)
      .in('status', ['pending', 'approved']);

    const keys = (data || []).map((row: any) => `${row.event_id}:${row.sport_id}`);
    setMyRegistrations(new Set(keys));
  };

  const isDeadlinePassed = (deadline: string | null) => {
    if (!deadline) return false;
    return isPast(new Date(deadline));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-display font-bold">Upcoming Events — Register Now</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (eventSports.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold">Upcoming Events — Register Now</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {eventSports.map((es) => {
          const registrationKey = `${es.event_id}:${es.sport_category_id}`;
          const isRegistered = myRegistrations.has(registrationKey);
          const deadlinePassed = isDeadlinePassed(es.registration_deadline);
          const isClosed = es.registration_form_status === 'closed' || deadlinePassed;

          return (
            <div key={es.id} className="dashboard-card overflow-hidden">
              <div className="h-24 bg-gradient-to-br from-primary via-primary/80 to-accent/50 relative">
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4">
                  <h3 className="font-display font-bold text-white truncate">{es.event?.name}</h3>
                  <p className="text-white/70 text-xs">{es.event?.university?.name}</p>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{es.sport_category?.icon}</span>
                    <span className="font-medium text-sm">{es.sport_category?.name}</span>
                  </div>
                  {isClosed ? (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-status-cancelled text-white">Closed</span>
                  ) : (
                    <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-status-live text-white">Open</span>
                  )}
                </div>

                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      {format(new Date(es.event?.start_date), 'MMM d')} - {format(new Date(es.event?.end_date), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {es.event?.venue && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="truncate">{es.event.venue}</span>
                    </div>
                  )}
                  {es.registration_deadline && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Deadline: {format(new Date(es.registration_deadline), 'MMM d, yyyy HH:mm')}</span>
                    </div>
                  )}
                </div>

                {es.eligibility_rules && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-2">{es.eligibility_rules}</p>
                )}

                <div className="pt-2">
                  {isRegistered ? (
                    <Button disabled className="w-full" variant="outline">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Already Registered
                    </Button>
                  ) : isClosed ? (
                    <Button disabled className="w-full" variant="outline">Registration Closed</Button>
                  ) : (
                    <Button className="w-full" asChild>
                      <Link to="/student/open-registrations">
                        Open Registration Form
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
