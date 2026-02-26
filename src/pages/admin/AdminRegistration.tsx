import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ClipboardList, Users } from 'lucide-react';
import { format } from 'date-fns';

interface SportSummary {
  sportId: string;
  count: number;
  sportName: string;
  sportIcon: string | null;
}

interface RegistrationDetail {
  id: string;
  user_id: string;
  team_name: string | null;
  created_at: string;
  event?: { name: string } | null;
  profile?: { full_name: string | null; email: string | null } | null;
}

export default function AdminRegistration() {
  const { sportId } = useParams();
  const [loading, setLoading] = useState(true);
  const [sportSummaries, setSportSummaries] = useState<SportSummary[]>([]);
  const [registrationDetails, setRegistrationDetails] = useState<RegistrationDetail[]>([]);
  const [selectedSportName, setSelectedSportName] = useState<string>('');

  useEffect(() => {
    void (sportId ? fetchSportDetails(sportId) : fetchSportOverview());
  }, [sportId]);

  const fetchSportOverview = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('registration_submissions').select('sport_id');
    if (error) {
      setSportSummaries([]);
      setLoading(false);
      return;
    }

    const counts = new Map<string, number>();
    (data || []).forEach((row) => {
      counts.set(row.sport_id, (counts.get(row.sport_id) || 0) + 1);
    });

    const sportIds = Array.from(counts.keys());
    let sportNameById = new Map<string, { name: string; icon: string | null }>();
    if (sportIds.length) {
      const { data: sports } = await supabase
        .from('sports_categories')
        .select('id, name, icon')
        .in('id', sportIds);

      sportNameById = new Map(
        (sports || []).map((sport) => [sport.id, { name: sport.name, icon: sport.icon }])
      );
    }

    const summaries = Array.from(counts.entries())
      .map(([id, count]) => ({
        sportId: id,
        count,
        sportName: sportNameById.get(id)?.name || 'Unknown Sport',
        sportIcon: sportNameById.get(id)?.icon || null,
      }))
      .sort((a, b) => b.count - a.count);

    setSportSummaries(summaries);
    setLoading(false);
  };

  const fetchSportDetails = async (id: string) => {
    setLoading(true);

    const [{ data: submissions, error }, { data: sport }] = await Promise.all([
      supabase
        .from('registration_submissions')
        .select('id, user_id, team_name, created_at, event:events(name)')
        .eq('sport_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('sports_categories').select('name').eq('id', id).maybeSingle(),
    ]);

    setSelectedSportName(sport?.name || 'Unknown Sport');

    if (error) {
      setRegistrationDetails([]);
      setLoading(false);
      return;
    }

    const rows = (submissions || []) as RegistrationDetail[];
    const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];

    let profiles: Array<{ id: string; full_name: string | null; email: string | null }> = [];
    if (userIds.length) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      profiles = profileRows || [];
    }

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

    setRegistrationDetails(
      rows.map((row) => ({
        ...row,
        profile: profileById.get(row.user_id) || null,
      }))
    );
    setLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {sportId ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl lg:text-3xl font-display font-bold">Registration Details</h1>
                <p className="text-muted-foreground">{selectedSportName}</p>
              </div>
              <Button variant="outline" asChild>
                <Link to="/admin/registration">Back</Link>
              </Button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : registrationDetails.length ? (
              <div className="dashboard-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3">Full Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrationDetails.map((row) => (
                      <tr key={row.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3">{row.profile?.full_name || 'Unknown User'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.profile?.email || '-'}</td>
                        <td className="px-4 py-3">{row.event?.name || '-'}</td>
                        <td className="px-4 py-3">{row.team_name || '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {format(new Date(row.created_at), 'MMM d, yyyy HH:mm')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dashboard-card p-10 text-center">
                <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No registrations found for this sport.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <h1 className="text-2xl lg:text-3xl font-display font-bold">Registrations by Sport</h1>
              <p className="text-muted-foreground">Source: registration submissions</p>
            </div>

            {loading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, index) => (
                  <Skeleton key={index} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : sportSummaries.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sportSummaries.map((item) => (
                  <Link
                    key={item.sportId}
                    to={`/admin/registration/${item.sportId}`}
                    className="dashboard-card p-5 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-display font-bold flex items-center gap-2">
                          <span>{item.sportIcon || '🏅'}</span>
                          {item.sportName}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">View submissions</p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                        {item.count}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dashboard-card p-10 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No registration submissions found.</p>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
