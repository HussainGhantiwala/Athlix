import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import BracketView from '@/components/tournament/BracketView';
import StandingsTable from '@/components/tournament/StandingsTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEventSportsFromApprovedForms } from '@/lib/eventSportConfig';

export default function Bracket() {
  const { eventId } = useParams<{ eventId: string }>();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);
  const [eventSports, setEventSports] = useState<any[]>([]);
  const [selectedSportId, setSelectedSportId] = useState('');

  useEffect(() => {
    if (eventId) fetchData();
  }, [eventId]);

  const fetchData = async () => {
    const [eventRes, sportsRes] = await Promise.all([
      supabase.from('events').select('*, university:universities(name)').eq('id', eventId!).single(),
      getEventSportsFromApprovedForms(eventId!),
    ]);

    setEvent(eventRes.data);
    setEventSports(sportsRes.eventSports || []);
    if (sportsRes.eventSports && sportsRes.eventSports.length > 0) {
      setSelectedSportId(sportsRes.eventSports[0].id);
    } else {
      setSelectedSportId('');
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!event) {
    return (
      <DashboardLayout>
        <div className="text-center py-24">
          <p className="text-muted-foreground">Event not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const tournamentType = event.tournament_type;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to={-1 as any}><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">{event.name}</h1>
            <p className="text-muted-foreground">
              {tournamentType === 'knockout' ? '🏆 Knockout Bracket' :
               tournamentType === 'group' ? '📊 Group Stage + Knockout' :
               '📋 League Standings'}
              {event.university?.name && ` — ${event.university.name}`}
            </p>
          </div>
        </div>

        {/* Sport Tabs */}
        {eventSports.length > 1 && (
          <Tabs value={selectedSportId} onValueChange={setSelectedSportId}>
            <TabsList>
              {eventSports.map(es => (
                <TabsTrigger key={es.id} value={es.id}>
                  {es.sport_category?.icon} {es.sport_category?.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {selectedSportId && (
          <div className="space-y-6">
            {(tournamentType === 'knockout' || tournamentType === 'group') && (
              <div>
                <h2 className="text-xl font-display font-bold mb-4">🏆 Bracket</h2>
                <BracketView eventSportId={selectedSportId} />
              </div>
            )}

            {(tournamentType === 'group' || tournamentType === 'league') && (
              <div>
                <h2 className="text-xl font-display font-bold mb-4">📊 Standings</h2>
                <StandingsTable eventSportId={selectedSportId} />
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
