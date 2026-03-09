import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Registration } from '@/types/database';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, ClipboardList, CheckCircle, XCircle, User } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function Registrations() {
  const { user, isAdmin, isFaculty, isStudentCoordinator } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchRegistrations();
  }, [statusFilter]);

  const fetchRegistrations = async () => {
    setLoading(true);
    let query = supabase
      .from('registrations')
      .select(`
        *,
        profile:profiles(full_name, email, avatar_url),
        event_sport:event_sports(
          sport_category:sports_categories(name, icon),
          event:events(name)
        )
      `)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as any);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to fetch registrations');
    } else {
      setRegistrations((data as unknown as Registration[]) || []);
    }
    setLoading(false);
  };

  const handleUpdateStatus = async (registrationId: string, newStatus: 'approved' | 'rejected') => {
    const { error } = await supabase
      .from('registrations')
      .update({
        status: newStatus,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (error) {
      toast.error('Failed to update registration');
    } else {
      toast.success(`Registration ${newStatus}`);
      fetchRegistrations();
    }
  };

  const filteredRegistrations = registrations.filter((reg) =>
    (reg as any).profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (reg as any).profile?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    reg.event_sport?.sport_category?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canManageRegistrations = isAdmin || isFaculty || isStudentCoordinator;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Registrations</h1>
          <p className="text-muted-foreground">Manage participant registrations</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search registrations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Registrations List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : filteredRegistrations.length > 0 ? (
          <div className="space-y-3">
            {filteredRegistrations.map((registration) => (
              <div
                key={registration.id}
                className="dashboard-card p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                {/* Participant Info */}
                <div className="flex items-center gap-3 flex-1">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={(registration as any).profile?.avatar_url} />
                    <AvatarFallback>
                      {(registration as any).profile?.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{(registration as any).profile?.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(registration as any).profile?.email}
                    </p>
                  </div>
                </div>

                {/* Sport & Event */}
                <div className="flex items-center gap-3">
                  <span className="text-xl">{registration.event_sport?.sport_category?.icon}</span>
                  <div>
                    <p className="font-medium">{registration.event_sport?.sport_category?.name}</p>
                    <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {registration.event_sport?.event?.name}
                    </p>
                  </div>
                </div>

                {/* Date */}
                <div className="text-sm text-muted-foreground">
                  {format(new Date(registration.created_at), 'MMM d, yyyy')}
                </div>

                {/* Status & Actions */}
                <div className="flex items-center gap-3">
                  <StatusBadge status={registration.status} />

                  {registration.status === 'pending' && canManageRegistrations && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-status-live border-status-live/50 hover:bg-status-live/10"
                        onClick={() => handleUpdateStatus(registration.id, 'approved')}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/50 hover:bg-destructive/10"
                        onClick={() => handleUpdateStatus(registration.id, 'rejected')}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No registrations found</h3>
            <p className="text-muted-foreground">
              {searchQuery ? 'Try adjusting your search query' : 'Registrations will appear here'}
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
