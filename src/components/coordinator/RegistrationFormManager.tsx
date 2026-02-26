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
import { Plus, ClipboardList, Send, FileText, Clock, CheckCircle } from 'lucide-react';

interface EventSportForm {
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
  pending_faculty_review: { label: 'Pending Faculty', className: 'bg-status-provisional text-white' },
  pending_admin_approval: { label: 'Pending Admin', className: 'bg-status-provisional text-white' },
  published: { label: 'Published', className: 'bg-status-live text-white' },
  closed: { label: 'Closed', className: 'bg-primary text-primary-foreground' },
  rejected: { label: 'Rejected', className: 'bg-status-cancelled text-white' },
};

export default function RegistrationFormManager() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<EventSportForm[]>([]);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [sports, setSports] = useState<{ id: string; name: string; icon: string | null }[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({
    event_id: '',
    sport_category_id: '',
    registration_deadline: '',
    max_participants: 50,
    eligibility_rules: '',
  });

  useEffect(() => {
    fetchForms();
    fetchEvents();
    fetchSports();
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

    setForms((data as unknown as EventSportForm[]) || []);
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
    if (!newForm.event_id || !newForm.sport_category_id) {
      toast.error('Please select event and sport');
      return;
    }

    setCreating(true);
    const { error } = await supabase.from('event_sports').insert({
      event_id: newForm.event_id,
      sport_category_id: newForm.sport_category_id,
      registration_deadline: newForm.registration_deadline || null,
      max_participants: newForm.max_participants,
      eligibility_rules: newForm.eligibility_rules || null,
      registration_form_status: 'draft' as any,
      form_created_by: user?.id,
      registration_open: false,
    });

    if (error) {
      toast.error('Failed to create registration form');
    } else {
      toast.success('Registration form created as draft');
      setIsCreateOpen(false);
      setNewForm({ event_id: '', sport_category_id: '', registration_deadline: '', max_participants: 50, eligibility_rules: '' });
      fetchForms();
    }
    setCreating(false);
  };

  const handleSubmitForReview = async (formId: string) => {
    const { error } = await supabase
      .from('event_sports')
      .update({ registration_form_status: 'pending_faculty_review' as any })
      .eq('id', formId);

    if (error) {
      toast.error('Failed to submit for review');
    } else {
      toast.success('Submitted for faculty review');
      fetchForms();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">Registration Forms</h1>
            <p className="text-muted-foreground">Create and manage event registration forms</p>
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
                <DialogTitle>Create Registration Form</DialogTitle>
                <DialogDescription>
                  Set up registration for an event sport. It will be reviewed by Faculty and Admin before publishing.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Event *</Label>
                  <Select value={newForm.event_id} onValueChange={(v) => setNewForm({ ...newForm, event_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                    <SelectContent>
                      {events.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sport *</Label>
                  <Select value={newForm.sport_category_id} onValueChange={(v) => setNewForm({ ...newForm, sport_category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select sport" /></SelectTrigger>
                    <SelectContent>
                      {sports.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.icon} {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Registration Deadline</Label>
                  <Input
                    type="datetime-local"
                    value={newForm.registration_deadline}
                    onChange={(e) => setNewForm({ ...newForm, registration_deadline: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Participants</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newForm.max_participants}
                    onChange={(e) => setNewForm({ ...newForm, max_participants: parseInt(e.target.value) || 50 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Eligibility Rules</Label>
                  <Textarea
                    placeholder="e.g. Must be a full-time student, minimum GPA 2.0"
                    value={newForm.eligibility_rules}
                    onChange={(e) => setNewForm({ ...newForm, eligibility_rules: e.target.value })}
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

        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : forms.length > 0 ? (
          <div className="space-y-3">
            {forms.map(form => {
              const status = statusLabels[form.registration_form_status] || statusLabels.draft;
              return (
                <div key={form.id} className="dashboard-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl">{form.sport_category?.icon}</span>
                    <div>
                      <p className="font-medium">{form.sport_category?.name}</p>
                      <p className="text-sm text-muted-foreground">{form.event?.name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {form.registration_deadline && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(form.registration_deadline).toLocaleDateString()}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      Max: {form.max_participants || '∞'}
                    </span>
                  </div>

                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${status.className}`}>
                    {status.label}
                  </span>

                  {form.registration_form_status === 'draft' && (
                    <Button size="sm" onClick={() => handleSubmitForReview(form.id)}>
                      <Send className="h-4 w-4 mr-1" />
                      Submit for Review
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No registration forms</h3>
            <p className="text-muted-foreground mb-4">Create a registration form for an event sport</p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Form
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
