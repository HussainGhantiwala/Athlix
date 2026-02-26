import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, FileText } from 'lucide-react';

interface RuleBook {
  id: string;
  title: string;
  content: string;
  pdf_url: string | null;
  published_at: string | null;
  sport?: { name: string; icon: string | null } | null;
}

export default function RuleBookViewer() {
  const [loading, setLoading] = useState(true);
  const [ruleBooks, setRuleBooks] = useState<RuleBook[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchRuleBooks();
  }, []);

  const fetchRuleBooks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('rule_books')
      .select('id, title, content, pdf_url, published_at, sport:sports_categories(name, icon)')
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    setRuleBooks((data as unknown as RuleBook[]) || []);
    setLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Rule Book</h1>
          <p className="text-muted-foreground">Official rules and regulations for all sports</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : ruleBooks.length > 0 ? (
          <div className="space-y-3">
            {ruleBooks.map(book => (
              <div key={book.id} className="dashboard-card overflow-hidden">
                <button
                  className="w-full p-4 flex items-center gap-4 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpanded(expanded === book.id ? null : book.id)}
                >
                  <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">{book.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {book.sport?.icon} {book.sport?.name || 'General'}
                    </p>
                  </div>
                  {book.pdf_url && (
                    <a
                      href={book.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FileText className="h-4 w-4" />
                      Download Rule Book
                    </a>
                  )}
                </button>
                {expanded === book.id && (
                  <div className="px-4 pb-4 border-t border-border pt-4">
                    <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                      {book.content || 'No content available.'}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-card p-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No rule books available</h3>
            <p className="text-muted-foreground">Rule books will appear here once published by the admin</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
