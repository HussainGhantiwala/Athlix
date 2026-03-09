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
import { Plus, BookOpen, Edit2, Trash2, Eye, Send, FileText, Download } from 'lucide-react';

interface RuleBook {
  id: string;
  title: string;
  sport_id: string | null;
  content: string;
  pdf_url: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  sport?: { name: string; icon: string | null } | null;
}

interface Sport {
  id: string;
  name: string;
  icon: string | null;
}

export default function RuleBookManager() {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ruleBooks, setRuleBooks] = useState<RuleBook[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<RuleBook | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '',
    sport_id: '',
    content: '',
    pdf_url: '',
  });

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchRuleBooks();
    fetchSports();
  }, []);

  const fetchRuleBooks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('rule_books')
      .select('*, sport:sports_categories(name, icon)')
      .order('created_at', { ascending: false });
    setRuleBooks((data as unknown as RuleBook[]) || []);
    setLoading(false);
  };

  const fetchSports = async () => {
    const { data } = await supabase
      .from('sports_categories')
      .select('id, name, icon')
      .order('name');
    setSports(data || []);
  };

  const resetForm = () => {
    setForm({ title: '', sport_id: '', content: '', pdf_url: '' });
    setPdfFile(null);
  };

  const openCreate = () => {
    resetForm();
    setEditingBook(null);
    setIsCreateOpen(true);
  };

  const openEdit = (book: RuleBook) => {
    setForm({
      title: book.title,
      sport_id: book.sport_id || '',
      content: book.content,
      pdf_url: book.pdf_url || '',
    });
    setEditingBook(book);
    setPdfFile(null);
    setIsCreateOpen(true);
  };

  const uploadPdf = async (): Promise<string | null> => {
    if (!pdfFile) return form.pdf_url || null;
    setUploading(true);
    const fileName = `${Date.now()}-${pdfFile.name}`;
    const { error } = await supabase.storage
      .from('rule-book-pdfs')
      .upload(fileName, pdfFile);

    if (error) {
      toast.error('Failed to upload PDF');
      setUploading(false);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('rule-book-pdfs')
      .getPublicUrl(fileName);

    setUploading(false);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);

    const pdfUrl = await uploadPdf();

    const payload = {
      title: form.title,
      sport_id: form.sport_id || null,
      content: form.content,
      pdf_url: pdfUrl,
    };

    if (editingBook) {
      const { error } = await supabase
        .from('rule_books')
        .update(payload)
        .eq('id', editingBook.id);
      if (error) {
        toast.error('Failed to update rule book');
      } else {
        toast.success('Rule book updated');
      }
    } else {
      const { error } = await supabase.from('rule_books').insert({
        ...payload,
        created_by: user?.id,
        status: 'draft',
      });
      if (error) {
        toast.error('Failed to create rule book');
      } else {
        toast.success('Rule book created as draft');
      }
    }

    setSaving(false);
    setIsCreateOpen(false);
    resetForm();
    setEditingBook(null);
    fetchRuleBooks();
  };

  const handlePublish = async (id: string) => {
    const { error } = await supabase
      .from('rule_books')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast.error('Failed to publish');
    } else {
      toast.success('Rule book published');
      fetchRuleBooks();
    }
  };

  const handleUnpublish = async (id: string) => {
    const { error } = await supabase
      .from('rule_books')
      .update({ status: 'draft', published_at: null })
      .eq('id', id);

    if (error) {
      toast.error('Failed to unpublish');
    } else {
      toast.success('Rule book unpublished');
      fetchRuleBooks();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('rule_books').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
    } else {
      toast.success('Rule book deleted');
      fetchRuleBooks();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold">Rule Book</h1>
            <p className="text-muted-foreground">Manage official rules and regulations for sports</p>
          </div>
          {isAdmin && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Rule Book
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : ruleBooks.length > 0 ? (
          <div className="space-y-3">
            {ruleBooks.map(book => (
              <div key={book.id} className="dashboard-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <BookOpen className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-medium">{book.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {book.sport?.icon} {book.sport?.name || 'General'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {book.pdf_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(book.pdf_url!, '_blank')}
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      Download PDF
                    </Button>
                  )}
                </div>

                <span className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                  book.status === 'published'
                    ? 'bg-status-live text-white'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {book.status === 'published' ? 'Published' : 'Draft'}
                </span>

                {isAdmin && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(book)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    {book.status === 'draft' ? (
                      <Button
                        size="sm"
                        className="bg-status-live hover:bg-status-live/90 text-white"
                        onClick={() => handlePublish(book.id)}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Publish
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handleUnpublish(book.id)}>
                        Unpublish
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(book.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No rule books yet</h3>
            <p className="text-muted-foreground">
              {isAdmin ? 'Create rule books for sports regulations' : 'Rule books will appear here once published'}
            </p>
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => { if (!open) { setIsCreateOpen(false); setEditingBook(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBook ? 'Edit Rule Book' : 'New Rule Book'}</DialogTitle>
            <DialogDescription>
              {editingBook ? 'Update rule book details' : 'Create a new rule book entry'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="e.g. Official Cricket Rules 2026"
                value={form.title}
                onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Sport</Label>
              <Select value={form.sport_id} onValueChange={(v) => setForm(p => ({ ...p, sport_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select sport (optional)" /></SelectTrigger>
                <SelectContent>
                  {sports.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.icon} {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                placeholder="Write the rules and regulations here..."
                value={form.content}
                onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))}
                rows={12}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Upload PDF (optional)</Label>
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              />
              {form.pdf_url && !pdfFile && (
                <p className="text-xs text-muted-foreground">
                  Current PDF: <a href={form.pdf_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View</a>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateOpen(false); setEditingBook(null); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving || uploading ? 'Saving...' : editingBook ? 'Update' : 'Create Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
