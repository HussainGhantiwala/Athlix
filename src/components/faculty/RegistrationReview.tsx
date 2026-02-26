import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { CheckCircle, XCircle, ClipboardList, Clock, FileText, Users } from 'lucide-react';

interface RegistrationForm {
  id: string;
  registration_form_status: string;
  registration_deadline: string | null;
  max_participants: number | null;
  eligibility_rules: string | null;
  form_created_by: string | null;
  sport_category: { name: string; icon: string | null } | null;
  event: { name: string; id: string } | null;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  pending_faculty_review: { label: 'Pending Your Review', className: 'bg-status-provisional text-white' },
  pending_admin_approval: { label: 'Sent to Admin', className: 'bg-status-finalized text-white' },
  published: { label: 'Published', className: 'bg-status-live text-white' },
  closed: { label: 'Closed', className: 'bg-primary text-primary-foreground' },
  rejected: { label: 'Rejected', className: 'bg-status-cancelled text-white' },
};

export default function RegistrationReview() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<RegistrationForm[]>([]);

  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('event_sports')
      .select(`
        id, registration_form_status, registration_deadline, max_participants, eligibility_rules, form_created_by,
        sport_category:sports_categories(name, icon),
        event:events(name, id)
      `)
      .not('registration_form_status', 'is', null)
      .order('created_at', { ascending: false });

    setForms((data as unknown as RegistrationForm[]) || []);
    setLoading(false);
  };

  const handleApproveForAdmin = async (formId: string) => {
    const { error } = await supabase
      .from('event_sports')
      .update({ registration_form_status: 'pending_admin_approval' as any })
      .eq('id', formId);

    if (error) {
      toast.error('Failed to approve');
    } else {
      toast.success('Approved and sent to Admin for final review');
      fetchForms();
    }
  };

  const handleReject = async (formId: string) => {
    const { error } = await supabase
      .from('event_sports')
      .update({ registration_form_status: 'rejected' as any })
      .eq('id', formId);

    if (error) {
      toast.error('Failed to reject');
    } else {
      toast.success('Registration form rejected');
      fetchForms();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Registration Form Review</h1>
          <p className="text-muted-foreground">Review registration forms submitted by Student Coordinators</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : forms.length > 0 ? (
          <div className="space-y-3">
            {forms.map(form => {
              const status = statusLabels[form.registration_form_status] || statusLabels.draft;
              const isPendingReview = form.registration_form_status === 'pending_faculty_review';

              return (
                <div key={form.id} className="dashboard-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl">{form.sport_category?.icon}</span>
                    <div>
                      <p className="font-medium">{form.sport_category?.name}</p>
                      <p className="text-sm text-muted-foreground">{form.event?.name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {form.registration_deadline && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(form.registration_deadline).toLocaleDateString()}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Max: {form.max_participants || '∞'}
                    </span>
                  </div>

                  {form.eligibility_rules && (
                    <p className="text-xs text-muted-foreground max-w-[200px] truncate" title={form.eligibility_rules}>
                      {form.eligibility_rules}
                    </p>
                  )}

                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap ${status.className}`}>
                    {status.label}
                  </span>

                  {isPendingReview && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-status-live border-status-live/50 hover:bg-status-live/10"
                        onClick={() => handleApproveForAdmin(form.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/50 hover:bg-destructive/10"
                        onClick={() => handleReject(form.id)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No registration forms</h3>
            <p className="text-muted-foreground">Registration forms will appear here when submitted by coordinators</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
