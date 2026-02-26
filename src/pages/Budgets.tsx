import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Budget, Event } from '@/types/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Search, DollarSign, CheckCircle, XCircle, FileText, Send } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

export default function Budgets() {
  const { user, isAdmin, isFaculty } = useAuth();
  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewingBudget, setReviewingBudget] = useState<Budget | null>(null);

  const [formData, setFormData] = useState({
    event_id: '',
    title: '',
    description: '',
    estimated_amount: '',
  });

  useEffect(() => {
    fetchBudgets();
    if (isFaculty) {
      fetchEvents();
    }
  }, [statusFilter]);

  const fetchBudgets = async () => {
    setLoading(true);
    let query = supabase
      .from('budgets')
      .select(`*, event:events(name)`)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as any);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to fetch budgets');
    } else {
      setBudgets((data as unknown as Budget[]) || []);
    }
    setLoading(false);
  };

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select('id, name')
      .in('status', ['approved', 'active'])
      .order('name');
    setEvents((data as Event[]) || []);
  };

  const handleCreate = async () => {
    if (!formData.event_id || !formData.title || !formData.estimated_amount) {
      toast.error('Please fill in required fields');
      return;
    }

    setCreating(true);
    const { error } = await supabase.from('budgets').insert({
      event_id: formData.event_id,
      title: formData.title,
      description: formData.description,
      estimated_amount: parseFloat(formData.estimated_amount),
      status: 'draft',
      submitted_by: user?.id,
    });

    if (error) {
      toast.error('Failed to create budget');
    } else {
      toast.success('Budget created as draft');
      setIsCreateOpen(false);
      resetForm();
      fetchBudgets();
    }
    setCreating(false);
  };

  const handleSubmit = async (budgetId: string) => {
    const { error } = await supabase
      .from('budgets')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', budgetId);

    if (error) {
      toast.error('Failed to submit budget');
    } else {
      toast.success('Budget submitted for approval');
      fetchBudgets();
    }
  };

  const handleReview = async (budgetId: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase
      .from('budgets')
      .update({
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes,
      })
      .eq('id', budgetId);

    if (error) {
      toast.error('Failed to review budget');
    } else {
      toast.success(`Budget ${status}`);
      setReviewingBudget(null);
      setReviewNotes('');
      fetchBudgets();
    }
  };

  const resetForm = () => {
    setFormData({
      event_id: '',
      title: '',
      description: '',
      estimated_amount: '',
    });
  };

  const filteredBudgets = budgets.filter((budget) =>
    budget.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    budget.event?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">Budgets</h1>
            <p className="text-muted-foreground">Manage event budgets and quotations</p>
          </div>

          {isFaculty && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Budget
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Budget</DialogTitle>
                  <DialogDescription>
                    Submit a new budget proposal for an event
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Event *</Label>
                    <Select
                      value={formData.event_id}
                      onValueChange={(value) => setFormData({ ...formData, event_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select event" />
                      </SelectTrigger>
                      <SelectContent>
                        {events.map((event) => (
                          <SelectItem key={event.id} value={event.id}>
                            {event.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Budget Title *</Label>
                    <Input
                      placeholder="Equipment and Supplies"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estimated Amount (₹) *</Label>
                    <Input
                      type="number"
                      placeholder="50000"
                      value={formData.estimated_amount}
                      onChange={(e) => setFormData({ ...formData, estimated_amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Detailed breakdown..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? 'Creating...' : 'Create Draft'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search budgets..."
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
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Budgets List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : filteredBudgets.length > 0 ? (
          <div className="space-y-4">
            {filteredBudgets.map((budget) => (
              <div key={budget.id} className="dashboard-card p-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{budget.title}</h3>
                      <p className="text-sm text-muted-foreground">{budget.event?.name}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-display font-bold">
                      {formatCurrency(budget.estimated_amount)}
                    </p>
                    {budget.actual_amount && (
                      <p className="text-sm text-muted-foreground">
                        Actual: {formatCurrency(budget.actual_amount)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusBadge status={budget.status} />

                    {budget.status === 'draft' && budget.submitted_by === user?.id && (
                      <Button size="sm" onClick={() => handleSubmit(budget.id)}>
                        <Send className="h-4 w-4 mr-1" />
                        Submit
                      </Button>
                    )}

                    {budget.status === 'submitted' && isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReviewingBudget(budget)}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Review
                      </Button>
                    )}
                  </div>
                </div>

                {budget.description && (
                  <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border">
                    {budget.description}
                  </p>
                )}

                {budget.review_notes && (
                  <p className="text-sm bg-muted/50 p-3 rounded-lg mt-3">
                    <strong>Review Notes:</strong> {budget.review_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No budgets found</h3>
            <p className="text-muted-foreground">
              {searchQuery ? 'Try adjusting your search' : 'Create your first budget proposal'}
            </p>
          </div>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={!!reviewingBudget} onOpenChange={() => { setReviewingBudget(null); setReviewNotes(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Budget</DialogTitle>
            <DialogDescription>
              {reviewingBudget?.title} - {formatCurrency(reviewingBudget?.estimated_amount || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {reviewingBudget?.description && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm">{reviewingBudget.description}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Review Notes</Label>
              <Textarea
                placeholder="Add notes about your decision..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => handleReview(reviewingBudget!.id, 'rejected')}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button onClick={() => handleReview(reviewingBudget!.id, 'approved')}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
