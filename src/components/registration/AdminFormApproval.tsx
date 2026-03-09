import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CheckCircle, XCircle, ClipboardList, Clock, Users, User, Shield, Eye } from 'lucide-react';
import { FormFieldBuilder, type FormField } from './FormFieldBuilder';
import { getEventSportsFromApprovedForms } from '@/lib/eventSportConfig';

interface RegistrationForm {
  id: string;
  event_id: string;
  sport_id: string;
  type: string;
  status: string;
  deadline: string | null;
  max_slots: number | null;
  eligibility_rules: string | null;
  form_schema: FormField[];
  created_at: string;
  event?: { name: string } | null;
  sport?: { name: string; icon: string | null } | null;
  created_by_profile?: { full_name: string } | null;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  pending_admin_review: { label: 'Pending Your Approval', className: 'bg-status-provisional text-white' },
  published: { label: 'Published', className: 'bg-status-live text-white' },
  closed: { label: 'Closed', className: 'bg-primary text-primary-foreground' },
  rejected: { label: 'Rejected', className: 'bg-destructive text-destructive-foreground' },
};

export default function AdminFormApproval() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<RegistrationForm[]>([]);
  const [previewForm, setPreviewForm] = useState<RegistrationForm | null>(null);

  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('registration_forms')
      .select(`
        *,
        event:events(name),
        sport:sports_categories(name, icon)
      `)
      .order('created_at', { ascending: false });

    setForms((data as unknown as RegistrationForm[]) || []);
    setLoading(false);
  };

  const handlePublish = async (form: RegistrationForm) => {
    const { error } = await supabase
      .from('registration_forms')
      .update({ status: 'published' })
      .eq('id', form.id);

    if (error) {
      toast.error('Failed to publish');
    } else {
      try {
        await getEventSportsFromApprovedForms(form.event_id);
      } catch (syncError: any) {
        toast.error(syncError.message || 'Form published but sport sync failed.');
      }

      toast.success('Registration form published! Sport is now available for the event.');
      fetchForms();
    }
  };

  const handleReject = async (formId: string) => {
    const { error } = await supabase
      .from('registration_forms')
      .update({ status: 'rejected' })
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
      .from('registration_forms')
      .update({ status: 'closed' })
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
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Registration Form Approval</h1>
          <p className="text-muted-foreground">Review and approve dynamic registration forms before publishing to students</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : forms.length > 0 ? (
          <div className="space-y-3">
            {forms.map(form => {
              const st = statusConfig[form.status] || statusConfig.draft;
              const isPending = form.status === 'pending_admin_review';
              const isPublished = form.status === 'published';
              const fieldCount = Array.isArray(form.form_schema) ? form.form_schema.length : 0;

              return (
                <div key={form.id} className="dashboard-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl">{form.sport?.icon || '🏅'}</span>
                    <div>
                      <p className="font-medium">{form.sport?.name}</p>
                      <p className="text-sm text-muted-foreground">{form.event?.name}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {form.type === 'team' ? <Users className="h-3 w-3" /> : <User className="h-3 w-3" />}
                          {form.type === 'team' ? 'Team' : 'Individual'}
                        </span>
                        <span>•</span>
                        <span>{fieldCount} custom fields</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {form.deadline && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(form.deadline).toLocaleDateString()}
                      </span>
                    )}
                    <span>Max: {form.max_slots || '∞'}</span>
                  </div>

                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap ${st.className}`}>
                    {st.label}
                  </span>

                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setPreviewForm(form)}>
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </Button>
                    {isPending && (
                      <>
                        <Button
                          size="sm"
                          className="bg-status-live hover:bg-status-live/90 text-white"
                          onClick={() => handlePublish(form)}
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
                      <Button size="sm" variant="outline" onClick={() => handleClose(form.id)}>
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
            <p className="text-muted-foreground">Forms will appear here after coordinators submit them</p>
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewForm} onOpenChange={(open) => !open && setPreviewForm(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Form Preview — {previewForm?.sport?.name}
            </DialogTitle>
            <DialogDescription>
              {previewForm?.event?.name} • {previewForm?.type === 'team' ? 'Team Registration' : 'Individual Registration'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {previewForm?.eligibility_rules && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-1">Eligibility Rules</p>
                <p className="text-muted-foreground">{previewForm.eligibility_rules}</p>
              </div>
            )}
            {previewForm?.type === 'team' && (
              <div className="space-y-3 p-3 border rounded-lg">
                <p className="text-sm font-medium">Team Fields (auto-included)</p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>• Team Name (required)</p>
                  <p>• Team Members list (required)</p>
                </div>
              </div>
            )}
            <FormFieldBuilder
              fields={Array.isArray(previewForm?.form_schema) ? previewForm.form_schema : []}
              onChange={() => {}}
              readOnly
            />
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
