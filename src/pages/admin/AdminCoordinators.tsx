import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';
import { format } from 'date-fns';

interface CoordinatorAssignmentRow {
  id: string;
  user_id: string;
  role: 'faculty' | 'student_coordinator';
  created_at: string;
  event?: { name: string } | null;
  profile?: { full_name: string | null; email: string | null } | null;
}

export default function AdminCoordinators() {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<CoordinatorAssignmentRow[]>([]);

  useEffect(() => {
    void fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('coordinator_assignments')
      .select(`
        id,
        user_id,
        role,
        created_at,
        event:events(name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as CoordinatorAssignmentRow[];
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
    setAssignments(
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
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Coordinators</h1>
          <p className="text-muted-foreground">Coordinator assignments by event</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : assignments.length ? (
          <div className="dashboard-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Assigned</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">{row.profile?.full_name || 'Unknown User'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.profile?.email || '-'}</td>
                    <td className="px-4 py-3 capitalize">{row.role.replace('_', ' ')}</td>
                    <td className="px-4 py-3">{row.event?.name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(new Date(row.created_at), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dashboard-card p-10 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No coordinator assignments found.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
