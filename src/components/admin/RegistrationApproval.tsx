import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { CheckCircle, XCircle, ClipboardList, Clock, Users, Shield } from 'lucide-react';

interface RegistrationForm {
  id: string;
  registration_form_status: string;
  registration_deadline: string | null;
  max_participants: number | null;
  eligibility_rules: string | null;
  sport_category: { name: string; icon: string | null } | null;
  event: { name: string; id: string } | null;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  pending_faculty_review: { label: 'Pending Faculty', className: 'bg-status-provisional text-white' },
  pending_admin_approval: { label: 'Pending Your Approval', className: 'bg-status-provisional text-white' },
  published: { label: 'Published', className: 'bg-status-live text-white' },
  closed: { label: 'Closed', className: 'bg-primary text-primary-foreground' },
  rejected: { label: 'Rejected', className: 'bg-status-cancelled text-white' },
};

export default function RegistrationApproval() {
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
        id, registration_form_status, registration_deadline, max_participants, eligibility_rules,
        sport_category:sports_categories(name, icon),
        event:events(name, id)
      `)
      .not('registration_form_status', 'is', null)
      .order('created_at', { ascending: false });

    setForms((data as unknown as RegistrationForm[]) || []);
    setLoading(false);
  };

  const handlePublish = async (formId: string) => {
    const { error } = await supabase
      .from('event_sports')
      .update({
        registration_form_status: 'published' as any,
        registration_open: true,
      })
      .eq('id', formId);

    if (error) {
      toast.error('Failed to publish');
    } else {
      toast.success('Registration form published! Students can now register.');
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

  const handleClose = async (formId: string) => {
    const { error } = await supabase
      .from('event_sports')
      .update({
        registration_form_status: 'closed' as any,
        registration_open: false,
      })
      .eq('id', formId);

    if (error) {
      toast.error('Failed to close');
    } else {
      toast.success('Registration closed');
      fetchForms();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Registration Approval</h1>
          <p className="text-muted-foreground">Final approval for registration forms before student visibility</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : forms.length > 0 ? (
          <div className="space-y-3">
            {forms.map(form => {
              const status = statusLabels[form.registration_form_status] || statusLabels.draft;
              const isPendingApproval = form.registration_form_status === 'pending_admin_approval';
              const isPublished = form.registration_form_status === 'published';

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

                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap ${status.className}`}>
                    {status.label}
                  </span>

                  <div className="flex gap-2">
                    {isPendingApproval && (
                      <>
                        <Button
                          size="sm"
                          className="bg-status-live hover:bg-status-live/90 text-white"
                          onClick={() => handlePublish(form.id)}
                        >
                          <Shield className="h-4 w-4 mr-1" />
                          Publish
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
                      </>
                    )}
                    {isPublished && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleClose(form.id)}
                      >
                        Close Registration
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No registration forms</h3>
            <p className="text-muted-foreground">Registration forms will appear here after faculty review</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
