import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, DollarSign, Shield, Timer, Trophy, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { University } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  const [universities, setUniversities] = useState<University[]>([]);

  useEffect(() => {
    const loadUniversities = async () => {
      const { data } = await supabase
        .from('universities')
        .select('id, name, short_name, logo_url, country, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('name')
        .limit(12);

      setUniversities((data as University[]) || []);
    };

    void loadUniversities();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/70">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl accent-gradient shadow-accent">
              <Trophy className="h-5 w-5 text-accent-foreground" />
            </div>
            <span className="font-display text-xl font-bold">Athlitix</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Login</Link>
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign Up</Link>
            <Link to="/register-university">
              <Button size="sm">Register University</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="hero-gradient py-20 text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-display font-bold leading-tight md:text-5xl">
            Manage University Sports with Athlitix
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-primary-foreground/80">
            A modern multi-tenant platform for universities to run events, organize teams, track live scores, and
            manage operations from a single dashboard.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="accent-gradient text-accent-foreground">Get Started</Button>
            </Link>
            <Link to="/scores">
              <Button size="lg" variant="secondary">View Live Scores</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="text-center text-3xl font-display font-bold">Features</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-accent" />Event Management</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Create events, configure sports, and manage schedules with approvals.</CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-accent" />Team Management</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Register teams, handle coordinators, and keep rosters organized.</CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Timer className="h-4 w-4 text-accent" />Live Scoring</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Run live matches with public score visibility and bracket progress.</CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><DollarSign className="h-4 w-4 text-accent" />Budget Tracking</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Track event budgets, submissions, approvals, and spending history.</CardContent></Card>
        </div>
      </section>

      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-3xl font-display font-bold">Universities Using Athlitix</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {universities.length > 0 ? universities.map((university) => (
              <div key={university.id} className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  {university.logo_url ? (
                    <img src={university.logo_url} alt={university.name} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <p className="font-medium">{university.name}</p>
                <p className="text-xs text-muted-foreground">{university.short_name}</p>
              </div>
            )) : (
              <div className="col-span-full rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
                Universities will appear here as they onboard.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="text-center text-3xl font-display font-bold">How It Works</h2>
        <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-3">
          <Card><CardHeader><CardTitle className="text-base">Step 1: Register University</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Create a tenant workspace for your institution.</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Step 2: Invite users</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Add admins, faculty, coordinators, and students securely.</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Step 3: Manage events</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Run events, monitor matches, and publish live outcomes.</CardContent></Card>
        </div>
      </section>

      <footer className="border-t py-10">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground md:flex-row">
          <p>Contact: support@athlitix.app</p>
          <div className="flex items-center gap-4">
            <Link to="/scores" className="hover:text-foreground">Live Scores</Link>
            <Link to="/auth" className="hover:text-foreground">Login</Link>
            <Link to="/register-university" className="hover:text-foreground">Register University</Link>
          </div>
          <p className="flex items-center gap-1"><Shield className="h-4 w-4" /> Multi-tenant secure platform</p>
        </div>
      </footer>
    </div>
  );
}
