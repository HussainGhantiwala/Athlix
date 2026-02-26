import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, ClipboardList, Send, FileText, Clock, Eye, Edit2, Users, User } from 'lucide-react';
import { FormFieldBuilder, type FormField } from './FormFieldBuilder';

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
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  pending_admin_review: { label: 'Pending Admin Review', className: 'bg-status-provisional text-white' },
  published: { label: 'Published', className: 'bg-status-live text-white' },
  closed: { label: 'Closed', className: 'bg-primary text-primary-foreground' },
  rejected: { label: 'Rejected', className: 'bg-destructive text-destructive-foreground' },
};

export default function RegistrationFormBuilder() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<RegistrationForm[]>([]);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [sports, setSports] = useState<{ id: string; name: string; icon: string | null }[]>([]);

  // Create dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({
    event_id: '',
    sport_id: '',
    type: 'individual' as 'individual' | 'team',
    deadline: '',
    max_slots: 50,
    eligibility_rules: '',
  });

  // Edit dialog
  const [editForm, setEditForm] = useState<RegistrationForm | null>(null);
  const [editFields, setEditFields] = useState<FormField[]>([]);
  const [saving, setSaving] = useState(false);

  // Preview dialog
  const [previewForm, setPreviewForm] = useState<RegistrationForm | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = () => {
    fetchForms();
    fetchEvents();
    fetchSports();
  };

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

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select('id, name')
      .in('status', ['approved', 'active'])
      .order('name');
    setEvents(data || []);
  };

  const fetchSports = async () => {
    const { data } = await supabase
      .from('sports_categories')
      .select('id, name, icon')
      .order('name');
    setSports(data || []);
  };

  const handleCreate = async () => {
    if (!newForm.event_id || !newForm.sport_id) {
      toast.error('Please select an event and sport');
      return;
    }
    setCreating(true);

    const { error } = await supabase.from('registration_forms').insert({
      event_id: newForm.event_id,
      sport_id: newForm.sport_id,
      type: newForm.type,
      deadline: newForm.deadline || null,
      max_slots: newForm.max_slots,
      eligibility_rules: newForm.eligibility_rules || null,
      form_schema: [],
      created_by: user?.id,
      status: 'draft',
    });

    if (error) {
      toast.error('Failed to create form');
    } else {
      toast.success('Registration form created as draft');
      setIsCreateOpen(false);
      setNewForm({ event_id: '', sport_id: '', type: 'individual', deadline: '', max_slots: 50, eligibility_rules: '' });
      fetchForms();
    }
    setCreating(false);
  };

  const openEdit = (form: RegistrationForm) => {
    setEditForm(form);
    setEditFields(Array.isArray(form.form_schema) ? form.form_schema : []);
  };

  const saveFields = async () => {
    if (!editForm) return;
    setSaving(true);

    const { error } = await supabase
      .from('registration_forms')
      .update({ form_schema: editFields as any })
      .eq('id', editForm.id);

    if (error) {
      toast.error('Failed to save form');
    } else {
      toast.success('Form fields saved');
      setEditForm(null);
      fetchForms();
    }
    setSaving(false);
  };

  const handleSubmitForReview = async (formId: string) => {
    const form = forms.find(f => f.id === formId);
    const schema = Array.isArray(form?.form_schema) ? form.form_schema : [];
    if (schema.length === 0) {
      toast.error('Please add at least one custom field before submitting');
      return;
    }

    const { error } = await supabase
      .from('registration_forms')
      .update({ status: 'pending_admin_review' })
      .eq('id', formId);

    if (error) {
      toast.error('Failed to submit for review');
    } else {
      toast.success('Submitted for Admin approval');
      fetchForms();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">Registration Form Builder</h1>
            <p className="text-muted-foreground">Create dynamic registration forms for events</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Form
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Registration Form</DialogTitle>
                <DialogDescription>
                  Create a registration form. After adding fields, submit it for Admin approval.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Event *</Label>
                  <Select value={newForm.event_id} onValueChange={(v) => setNewForm(p => ({ ...p, event_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                    <SelectContent>
                      {events.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sport *</Label>
                  <Select value={newForm.sport_id} onValueChange={(v) => setNewForm(p => ({ ...p, sport_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select sport" /></SelectTrigger>
                    <SelectContent>
                      {sports.map(s => <SelectItem key={s.id} value={s.id}>{s.icon} {s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Registration Type *</Label>
                  <Select value={newForm.type} onValueChange={(v: 'individual' | 'team') => setNewForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual"><div className="flex items-center gap-2"><User className="h-4 w-4" /> Individual</div></SelectItem>
                      <SelectItem value="team"><div className="flex items-center gap-2"><Users className="h-4 w-4" /> Team</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Registration Deadline</Label>
                  <Input
                    type="datetime-local"
                    value={newForm.deadline}
                    onChange={(e) => setNewForm(p => ({ ...p, deadline: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Slots</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newForm.max_slots}
                    onChange={(e) => setNewForm(p => ({ ...p, max_slots: parseInt(e.target.value) || 50 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Eligibility Rules</Label>
                  <Textarea
                    placeholder="e.g. Must be a full-time student, minimum GPA 2.0"
                    value={newForm.eligibility_rules}
                    onChange={(e) => setNewForm(p => ({ ...p, eligibility_rules: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? 'Creating...' : 'Create Draft'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Forms List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : forms.length > 0 ? (
          <div className="space-y-3">
            {forms.map(form => {
              const st = statusConfig[form.status] || statusConfig.draft;
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
                        <span>{fieldCount} custom field{fieldCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {form.deadline && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(form.deadline).toLocaleDateString()}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      Max: {form.max_slots || '∞'}
                    </span>
                  </div>

                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap ${st.className}`}>
                    {st.label}
                  </span>

                  <div className="flex gap-2">
                    {form.status === 'draft' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openEdit(form)}>
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit Fields
                        </Button>
                        <Button size="sm" onClick={() => handleSubmitForReview(form.id)}>
                          <Send className="h-4 w-4 mr-1" />
                          Submit for Approval
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setPreviewForm(form)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No registration forms</h3>
            <p className="text-muted-foreground mb-4">Create a dynamic registration form for an event sport</p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Form
            </Button>
          </div>
        )}
      </div>

      {/* Edit Fields Dialog */}
      <Dialog open={!!editForm} onOpenChange={(open) => !open && setEditForm(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Form Fields — {editForm?.sport?.name}
            </DialogTitle>
            <DialogDescription>
              Add custom fields to your registration form. Drag to reorder.
            </DialogDescription>
          </DialogHeader>
          <FormFieldBuilder fields={editFields} onChange={setEditFields} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditForm(null)}>Cancel</Button>
            <Button onClick={saveFields} disabled={saving}>
              {saving ? 'Saving...' : 'Save Fields'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Team Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="Enter team name" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Team Members <span className="text-destructive">*</span></Label>
                  <Input placeholder="Member names will be entered here" disabled />
                </div>
              </div>
            )}
            <FormFieldBuilder
              fields={Array.isArray(previewForm?.form_schema) ? previewForm.form_schema : []}
              onChange={() => {}}
              readOnly
            />
            {(!previewForm?.form_schema || (Array.isArray(previewForm.form_schema) && previewForm.form_schema.length === 0)) && (
              <p className="text-center text-muted-foreground py-4">No custom fields added yet</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
