import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, Eye, ClipboardList, Users, User } from 'lucide-react';
import type { FormField } from './FormFieldBuilder';

interface FormOption {
  id: string;
  type: string;
  form_schema: FormField[];
  event?: { name: string } | null;
  sport?: { name: string; icon: string | null } | null;
}

interface Submission {
  id: string;
  form_id: string;
  submitted_by: string;
  team_name: string | null;
  team_members: { name: string }[] | null;
  submission_data: Record<string, any>;
  created_at: string;
  profile?: { full_name: string; email: string } | null;
}

export default function SubmissionsViewer() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [detailSubmission, setDetailSubmission] = useState<Submission | null>(null);

  const basePath = role === 'admin' ? '/admin' : '/coordinator';

  useEffect(() => {
    fetchForms();
  }, []);

  useEffect(() => {
    if (selectedFormId) fetchSubmissions();
  }, [selectedFormId]);

  const fetchForms = async () => {
    const { data } = await supabase
      .from('registration_forms')
      .select(`
        id, type, form_schema,
        event:events(name),
        sport:sports_categories(name, icon)
      `)
      .order('created_at', { ascending: false });

    const formsList = (data as unknown as FormOption[]) || [];
    setForms(formsList);
    if (formsList.length > 0) setSelectedFormId(formsList[0].id);
    setLoading(false);
  };

  const fetchSubmissions = async () => {
    const { data } = await supabase
      .from('registration_submissions')
      .select(`
        *
      `)
      .eq('form_id', selectedFormId)
      .order('created_at', { ascending: false });

    // Fetch profiles separately for each submission
    const subs = (data || []) as unknown as Submission[];
    if (subs.length > 0) {
      const userIds = [...new Set(subs.map(s => s.submitted_by))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      for (const sub of subs) {
        const p = profileMap.get(sub.submitted_by);
        if (p) sub.profile = { full_name: p.full_name, email: p.email };
      }
    }

    setSubmissions(subs);
  };

  const selectedForm = forms.find(f => f.id === selectedFormId);
  const schema: FormField[] = Array.isArray(selectedForm?.form_schema) ? selectedForm.form_schema : [];

  const exportCSV = () => {
    if (submissions.length === 0) return;

    const isTeam = selectedForm?.type === 'team';
    const headers = [
      'Name',
      'Email',
      ...(isTeam ? ['Team Name', 'Team Members'] : []),
      ...schema.map(f => f.label || 'Untitled'),
      'Submitted At',
    ];

    const rows = submissions.map(sub => [
      sub.profile?.full_name || '',
      sub.profile?.email || '',
      ...(isTeam ? [
        sub.team_name || '',
        (sub.team_members || []).map(m => m.name).join('; '),
      ] : []),
      ...schema.map(f => {
        const val = sub.submission_data?.[f.id];
        return typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val || '');
      }),
      new Date(sub.created_at).toLocaleString(),
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submissions-${selectedForm?.sport?.name || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">Registration Submissions</h1>
            <p className="text-muted-foreground">View and export registered participants</p>
          </div>
          <Button variant="outline" onClick={exportCSV} disabled={submissions.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Form selector */}
        <div className="max-w-sm">
          <Select value={selectedFormId} onValueChange={setSelectedFormId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a form" />
            </SelectTrigger>
            <SelectContent>
              {forms.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  {f.sport?.icon} {f.sport?.name} — {f.event?.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Submissions table */}
        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : submissions.length > 0 ? (
          <div className="dashboard-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    {selectedForm?.type === 'team' && (
                      <>
                        <TableHead>Team</TableHead>
                        <TableHead>Members</TableHead>
                      </>
                    )}
                    {schema.slice(0, 3).map(f => (
                      <TableHead key={f.id}>{f.label || 'Untitled'}</TableHead>
                    ))}
                    <TableHead>Submitted</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map(sub => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.profile?.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{sub.profile?.email}</TableCell>
                      {selectedForm?.type === 'team' && (
                        <>
                          <TableCell>{sub.team_name}</TableCell>
                          <TableCell className="text-sm">
                            {(sub.team_members || []).length} members
                          </TableCell>
                        </>
                      )}
                      {schema.slice(0, 3).map(f => (
                        <TableCell key={f.id} className="text-sm">
                          {(() => {
                            const val = sub.submission_data?.[f.id];
                            return typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val || '—');
                          })()}
                        </TableCell>
                      ))}
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setDetailSubmission(sub)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : selectedFormId ? (
          <div className="dashboard-card p-12 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No submissions yet</h3>
            <p className="text-muted-foreground">Submissions will appear here once students register</p>
          </div>
        ) : null}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailSubmission} onOpenChange={(open) => !open && setDetailSubmission(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submission Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium">{detailSubmission?.profile?.full_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium">{detailSubmission?.profile?.email}</p>
              </div>
            </div>

            {selectedForm?.type === 'team' && detailSubmission && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">Team Name</p>
                  <p className="font-medium">{detailSubmission.team_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Team Members</p>
                  <ul className="list-disc list-inside text-sm">
                    {(detailSubmission.team_members || []).map((m, i) => (
                      <li key={i}>{m.name}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {schema.map(field => (
              <div key={field.id}>
                <p className="text-xs text-muted-foreground">{field.label || 'Untitled'}</p>
                <p className="font-medium">
                  {(() => {
                    const val = detailSubmission?.submission_data?.[field.id];
                    if (val === undefined || val === null || val === '') return '—';
                    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
                    return String(val);
                  })()}
                </p>
              </div>
            ))}

            <div>
              <p className="text-xs text-muted-foreground">Submitted At</p>
              <p className="font-medium">
                {detailSubmission ? new Date(detailSubmission.created_at).toLocaleString() : ''}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
