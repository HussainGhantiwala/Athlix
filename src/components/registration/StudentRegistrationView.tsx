import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ClipboardList, Clock, Users, User, CheckCircle, AlertCircle } from 'lucide-react';
import type { FormField } from './FormFieldBuilder';

interface PublishedForm {
  id: string;
  event_id: string;
  sport_id: string;
  type: string;
  status: string;
  deadline: string | null;
  max_slots: number | null;
  eligibility_rules: string | null;
  form_schema: FormField[];
  event?: { name: string } | null;
  sport?: { name: string; icon: string | null } | null;
  submission_count?: number;
}

export default function StudentRegistrationView() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<PublishedForm[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Set<string>>(new Set());

  // Registration dialog
  const [selectedForm, setSelectedForm] = useState<PublishedForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [teamName, setTeamName] = useState('');
  const [teamMembers, setTeamMembers] = useState('');

  useEffect(() => {
    fetchForms();
    fetchMySubmissions();
  }, [user?.id]);

  const fetchForms = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('registration_forms')
      .select(`
        *,
        event:events(name),
        sport:sports_categories(name, icon)
      `)
      .in('status', ['published', 'closed'])
      .order('created_at', { ascending: false });

    // Get submission counts
    const formsWithCounts: PublishedForm[] = [];
    for (const form of (data || []) as unknown as PublishedForm[]) {
      const { count } = await supabase
        .from('registration_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('form_id', form.id);
      formsWithCounts.push({ ...form, submission_count: count || 0 });
    }

    setForms(formsWithCounts);
    setLoading(false);
  };

  const fetchMySubmissions = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('registration_submissions')
      .select('form_id')
      .or(`user_id.eq.${user.id},submitted_by.eq.${user.id}`);

    setMySubmissions(new Set((data || []).map(d => d.form_id)));
  };

  const openRegister = (form: PublishedForm) => {
    setSelectedForm(form);
    setFormData({});
    setTeamName('');
    setTeamMembers('');
  };

  const handleSubmit = async () => {
    if (!selectedForm || !user?.id) return;

    // Validate required fields
    const schema = Array.isArray(selectedForm.form_schema) ? selectedForm.form_schema : [];
    for (const field of schema) {
      if (field.required && !formData[field.id]) {
        toast.error(`Please fill in: ${field.label}`);
        return;
      }
    }

    if (selectedForm.type === 'team') {
      if (!teamName.trim()) {
        toast.error('Team name is required');
        return;
      }
      if (!teamMembers.trim()) {
        toast.error('Team members are required');
        return;
      }
    }

    // Check slot availability
    if (selectedForm.max_slots && (selectedForm.submission_count || 0) >= selectedForm.max_slots) {
      toast.error('Registration is full');
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from('registration_submissions').insert({
      form_id: selectedForm.id,
      event_id: selectedForm.event_id,
      sport_id: selectedForm.sport_id,
      user_id: user.id,
      submitted_by: user.id,
      status: 'approved',
      team_name: selectedForm.type === 'team' ? teamName : null,
      team_members: selectedForm.type === 'team'
        ? teamMembers.split('\n').filter(m => m.trim()).map(m => ({ name: m.trim() }))
        : null,
      submission_data: formData,
    });

    if (error) {
      if (error.message.includes('row-level security')) {
        toast.error('Permission denied. Please make sure you are logged in.');
      } else {
        toast.error('Failed to submit registration');
      }
    } else {
      toast.success('Registration submitted successfully!');
      setSelectedForm(null);
      fetchForms();
      fetchMySubmissions();
    }
    setSubmitting(false);
  };

  const renderField = (field: FormField) => {
    const value = formData[field.id] || '';

    switch (field.type) {
      case 'short_text':
        return (
          <Input
            placeholder={field.placeholder || 'Enter text...'}
            value={value}
            onChange={(e) => setFormData(p => ({ ...p, [field.id]: e.target.value }))}
          />
        );
      case 'long_text':
        return (
          <Textarea
            placeholder={field.placeholder || 'Enter text...'}
            value={value}
            onChange={(e) => setFormData(p => ({ ...p, [field.id]: e.target.value }))}
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => setFormData(p => ({ ...p, [field.id]: e.target.value }))}
          />
        );
      case 'email':
        return (
          <Input
            type="email"
            placeholder="email@example.com"
            value={value}
            onChange={(e) => setFormData(p => ({ ...p, [field.id]: e.target.value }))}
          />
        );
      case 'dropdown':
        return (
          <Select value={value} onValueChange={(v) => setFormData(p => ({ ...p, [field.id]: v }))}>
            <SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger>
            <SelectContent>
              {field.options?.map((opt, i) => (
                <SelectItem key={i} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'checkbox':
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={!!value}
              onCheckedChange={(checked) => setFormData(p => ({ ...p, [field.id]: checked }))}
            />
            <span className="text-sm">{field.placeholder || 'Yes'}</span>
          </div>
        );
      case 'file':
        return (
          <Input
            type="text"
            placeholder="Paste file URL or link..."
            value={value}
            onChange={(e) => setFormData(p => ({ ...p, [field.id]: e.target.value }))}
          />
        );
      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Open Registrations</h1>
          <p className="text-muted-foreground">Register for upcoming sports events</p>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : forms.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {forms.map(form => {
              const hasSubmitted = mySubmissions.has(form.id);
              const isClosed = form.status === 'closed';
              const isFull = form.max_slots ? (form.submission_count || 0) >= form.max_slots : false;
              const isDeadlinePassed = form.deadline ? new Date(form.deadline) < new Date() : false;
              const canRegister = !hasSubmitted && !isClosed && !isFull && !isDeadlinePassed;

              return (
                <div key={form.id} className="dashboard-card p-5 flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{form.sport?.icon || '🏅'}</span>
                    <div>
                      <p className="font-display font-bold">{form.sport?.name}</p>
                      <p className="text-sm text-muted-foreground">{form.event?.name}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-muted-foreground flex-1">
                    <div className="flex items-center gap-2">
                      {form.type === 'team' ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                      <span>{form.type === 'team' ? 'Team Event' : 'Individual Event'}</span>
                    </div>
                    {form.deadline && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>Deadline: {new Date(form.deadline).toLocaleDateString()}</span>
                      </div>
                    )}
                    {form.max_slots && (
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        <span>Slots: {form.submission_count || 0} / {form.max_slots}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    {hasSubmitted ? (
                      <div className="flex items-center gap-2 text-sm text-status-live font-medium">
                        <CheckCircle className="h-4 w-4" />
                        Registered
                      </div>
                    ) : isClosed || isDeadlinePassed ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                        <AlertCircle className="h-4 w-4" />
                        Registration Closed
                      </div>
                    ) : isFull ? (
                      <div className="flex items-center gap-2 text-sm text-destructive font-medium">
                        <AlertCircle className="h-4 w-4" />
                        Registration Full
                      </div>
                    ) : (
                      <Button className="w-full" onClick={() => openRegister(form)}>
                        Register Now
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
            <h3 className="text-lg font-semibold mb-2">No open registrations</h3>
            <p className="text-muted-foreground">Check back later for new registration opportunities</p>
          </div>
        )}
      </div>

      {/* Registration Form Dialog */}
      <Dialog open={!!selectedForm} onOpenChange={(open) => !open && setSelectedForm(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{selectedForm?.sport?.icon}</span>
              Register — {selectedForm?.sport?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedForm?.event?.name} • {selectedForm?.type === 'team' ? 'Team Registration' : 'Individual Registration'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {selectedForm?.eligibility_rules && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-1">Eligibility Rules</p>
                <p className="text-muted-foreground">{selectedForm.eligibility_rules}</p>
              </div>
            )}

            {/* Team fields */}
            {selectedForm?.type === 'team' && (
              <>
                <div className="space-y-2">
                  <Label>Team Name <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="Enter your team name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Team Members <span className="text-destructive">*</span></Label>
                  <Textarea
                    placeholder="Enter each member name on a new line"
                    value={teamMembers}
                    onChange={(e) => setTeamMembers(e.target.value)}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">One member per line</p>
                </div>
              </>
            )}

            {/* Dynamic fields */}
            {(Array.isArray(selectedForm?.form_schema) ? selectedForm.form_schema : []).map((field) => (
              <div key={field.id} className="space-y-2">
                <Label>
                  {field.label || 'Untitled Field'}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {renderField(field)}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedForm(null)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Registration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
