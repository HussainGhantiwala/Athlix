import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Menu,
  Shield,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { University } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const fadeInUp = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.55, ease: 'easeOut' as const },
};

const featureCards = [
  {
    icon: CalendarDays,
    title: 'Event Management',
    description: 'Plan, approve, and run university tournaments with clear schedules and ownership.',
    className: 'md:col-span-2',
  },
  {
    icon: Users,
    title: 'Team Management',
    description: 'Handle players, coordinators, and rosters without spreadsheet chaos.',
    className: '',
  },
  {
    icon: Sparkles,
    title: 'Live Match Scoring',
    description: 'Publish real-time results that students and faculties can follow instantly.',
    className: '',
  },
  {
    icon: ClipboardList,
    title: 'Brackets & Fixtures',
    description: 'Auto-structure fixtures with bracket progression and clear outcomes.',
    className: '',
  },
  {
    icon: Shield,
    title: 'Role-Based Access',
    description: 'Admin, faculty, coordinators, and students each get focused workflows.',
    className: '',
  },
  {
    icon: BarChart3,
    title: 'Budget & Analytics',
    description: 'Track costs, approvals, and performance insights in one secure platform.',
    className: 'md:col-span-2',
  },
];

const navItems = [
  { label: 'Home', href: '#home' },
  { label: 'Features', href: '#features' },
  { label: 'Universities', href: '#universities' },
  { label: 'Live Scores', href: '#scores' },
  { label: 'Contact', href: '#contact' },
];

export default function HomePage() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const loadUniversities = async () => {
      const { data, error } = await supabase
        .from('universities')
        .select('id, name, short_name, logo_url, is_active, country, created_at, updated_at')
        .eq('is_active', true)
        .order('name')
        .limit(16);

      if (!error) {
        setUniversities((data as University[]) || []);
      }
    };

    void loadUniversities();
  }, []);

  const logoItems = useMemo(() => {
    if (universities.length > 0) {
      return universities.map((uni) => ({
        id: uni.id,
        name: uni.name,
        shortName: uni.short_name,
        logo: uni.logo_url || '',
      }));
    }

    return [
      { id: 'p1', name: 'Northfield University', shortName: 'NFU', logo: '' },
      { id: 'p2', name: 'Riverstone College', shortName: 'RSC', logo: '' },
      { id: 'p3', name: 'Pinecrest Institute', shortName: 'PCI', logo: '' },
      { id: 'p4', name: 'Westbridge University', shortName: 'WBU', logo: '' },
      { id: 'p5', name: 'Greenfield Campus', shortName: 'GFC', logo: '' },
      { id: 'p6', name: 'Stonehill Academy', shortName: 'SHA', logo: '' },
    ];
  }, [universities]);

  return (
    <div className="min-h-screen bg-[#050A18] text-white">
      <style>{`
        @keyframes floatUp {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.65; }
        }
        .floating-orb { animation: floatUp 6s ease-in-out infinite; }
        .marquee-track { animation: marquee 26s linear infinite; }
        .hero-glow { animation: pulseGlow 5s ease-in-out infinite; }
      `}</style>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050A18]/70 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.35)]">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-bold">Athlitix</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => (
              <a key={item.label} href={item.href} className="text-sm text-white/80 transition hover:text-white">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link to="/auth" className="text-sm text-white/80 transition hover:text-white">Login</Link>
            <Link to="/auth" className="text-sm text-white/80 transition hover:text-white">Sign Up</Link>
            <Link to="/register-university">
              <Button size="sm" className="bg-gradient-to-r from-blue-500 to-emerald-400 text-white hover:opacity-95">
                Register University
              </Button>
            </Link>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 md:hidden"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 px-4 py-4 md:hidden">
            <div className="flex flex-col gap-3">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-sm text-white/80"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <div className="mt-2 flex items-center gap-3">
                <Link to="/auth" className="text-sm text-white/80">Login</Link>
                <Link to="/auth" className="text-sm text-white/80">Sign Up</Link>
              </div>
              <Link to="/register-university" onClick={() => setMenuOpen(false)}>
                <Button className="w-full bg-gradient-to-r from-blue-500 to-emerald-400 text-white">
                  Register University
                </Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      <section id="home" className="relative overflow-hidden bg-gradient-to-br from-[#071B45] via-[#0A1A3B] to-[#043A33] px-4 py-24 md:py-32">
        <div className="hero-glow absolute left-1/2 top-16 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="floating-orb absolute left-[12%] top-28 hidden h-24 w-24 rounded-full bg-blue-400/20 blur-2xl md:block" />
        <div className="floating-orb absolute right-[14%] top-40 hidden h-32 w-32 rounded-full bg-emerald-300/20 blur-2xl md:block" />

        <motion.div {...fadeInUp} className="container relative mx-auto text-center">
          <p className="mb-5 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs uppercase tracking-widest text-white/80">
            University Sports Management System
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
            Manage University Sports Like a Pro
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-white/80 md:text-lg">
            Events, teams, live scoring, and analytics - all in one platform
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register-university">
              <Button size="lg" className="bg-gradient-to-r from-blue-500 to-emerald-400 px-8 text-white hover:opacity-95">
                Get Started
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/scores">
              <Button size="lg" variant="outline" className="border-white/30 bg-white/10 px-8 text-white hover:bg-white/20">
                View Live Scores
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      <section id="universities" className="border-y border-white/10 bg-[#08112B] py-14">
        <motion.div {...fadeInUp} className="container mx-auto px-4">
          <h2 className="text-center text-3xl font-bold md:text-4xl">Trusted by Universities</h2>
          <div className="relative mt-8 overflow-hidden">
            <div className="marquee-track flex w-[200%] gap-4">
              {[...logoItems, ...logoItems].map((uni, idx) => (
                <div
                  key={`${uni.id}-${idx}`}
                  className="flex min-w-[220px] items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl"
                >
                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                    {uni.logo ? (
                      <img
                        src={uni.logo}
                        alt={uni.name}
                        loading="lazy"
                        className="h-11 w-11 object-cover"
                      />
                    ) : (
                      <Building2 className="h-5 w-5 text-white/70" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{uni.shortName}</p>
                    <p className="text-xs text-white/70">{uni.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      <section id="features" className="container mx-auto px-4 py-20">
        <motion.div {...fadeInUp}>
          <h2 className="text-center text-3xl font-bold md:text-4xl">Built for Modern Sports Operations</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-white/70">
            Powerful workflows in a clean bento grid designed for real university teams.
          </p>
        </motion.div>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {featureCards.map((feature, index) => (
            <motion.div
              key={feature.title}
              {...fadeInUp}
              transition={{ ...fadeInUp.transition, delay: index * 0.04 }}
              className={feature.className}
            >
              <Card className="h-full border-white/10 bg-white/5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-emerald-300/40 hover:bg-white/10">
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/40 to-emerald-400/40">
                    <feature.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white/80">{feature.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20">
        <motion.div {...fadeInUp} className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-8 backdrop-blur-xl md:p-10">
          <h2 className="text-3xl font-bold md:text-4xl">How It Works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              'Register your university',
              'Invite coordinators & students',
              'Manage events & matches',
            ].map((step, idx) => (
              <div key={step} className="relative rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/20 text-sm font-bold text-emerald-300">
                  {idx + 1}
                </div>
                <p className="font-medium">{step}</p>
                {idx < 2 && <div className="absolute right-2 top-1/2 hidden h-px w-8 bg-white/20 md:block" />}
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="container mx-auto px-4 pb-20">
        <motion.div {...fadeInUp}>
          <h2 className="text-center text-3xl font-bold md:text-4xl">Live Preview</h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <Card className="border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <p className="mb-3 text-sm font-semibold text-white/80">Dashboard UI Preview</p>
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#10224F] to-[#0A3B35] p-4">
                <div className="mb-3 h-3 w-40 rounded bg-white/20" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="h-20 rounded-xl bg-white/15" />
                  <div className="h-20 rounded-xl bg-white/15" />
                  <div className="h-20 rounded-xl bg-white/15" />
                </div>
                <div className="mt-3 h-28 rounded-xl bg-white/10" />
              </div>
            </Card>
            <Card className="border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <p className="mb-3 text-sm font-semibold text-white/80">Match Scoreboard Preview</p>
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#163053] to-[#114141] p-4">
                <div className="mb-4 flex items-center justify-between text-sm text-white/70">
                  <span>Live Match</span>
                  <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-emerald-300">Live</span>
                </div>
                <div className="grid grid-cols-3 items-center gap-2 text-center">
                  <div>
                    <p className="text-xs text-white/70">Team A</p>
                    <p className="text-3xl font-bold text-white/80">54</p>
                  </div>
                  <p className="text-white/60">-</p>
                  <div>
                    <p className="text-xs text-white/70">Team B</p>
                    <p className="text-3xl font-bold text-white/80">49</p>
                  </div>
                </div>
                <div className="mt-4 h-2 rounded-full bg-white/15">
                  <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-blue-500 to-emerald-400" />
                </div>
              </div>
            </Card>
          </div>
        </motion.div>
      </section>

      <section id="scores" className="container mx-auto px-4 pb-20">
        <motion.div {...fadeInUp} className="rounded-3xl border border-white/10 bg-gradient-to-r from-blue-600/20 to-emerald-500/20 p-8 text-center backdrop-blur-xl">
          <h2 className="text-3xl font-bold md:text-4xl">Watch Matches Live</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/75">
            Follow live results, completed fixtures, and tournament brackets from public scoreboards.
          </p>
          <Link to="/scores">
            <Button size="lg" className="mt-6 bg-gradient-to-r from-blue-500 to-emerald-400 text-white">
              Go to Live Scores
            </Button>
          </Link>
        </motion.div>
      </section>

      <section id="contact" className="container mx-auto px-4 pb-16">
        <motion.div {...fadeInUp} className="grid gap-4 lg:grid-cols-2">
          <Card className="border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <p className="text-sm uppercase tracking-wide text-white/60">Contact us for demo</p>
            <h3 className="mt-2 text-3xl font-bold">See Athlitix in Action</h3>
            <p className="mt-3 text-white/70">
              Talk to our team to set up your university sports ecosystem.
            </p>
            <p className="mt-5 text-sm text-white/70">support@athlitix.app</p>
          </Card>
          <Card className="border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <form className="space-y-3">
              <input
                type="text"
                placeholder="Name"
                className="h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm outline-none placeholder:text-white/50 focus:border-emerald-300/60"
              />
              <input
                type="email"
                placeholder="Email"
                className="h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm outline-none placeholder:text-white/50 focus:border-emerald-300/60"
              />
              <textarea
                placeholder="Message"
                rows={4}
                className="w-full rounded-xl border border-white/15 bg-white/10 p-3 text-sm outline-none placeholder:text-white/50 focus:border-emerald-300/60"
              />
              <Button type="button" className="w-full bg-gradient-to-r from-blue-500 to-emerald-400 text-white">
                Request Demo
              </Button>
            </form>
          </Card>
        </motion.div>
      </section>

      <footer className="border-t border-white/10 py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 text-sm text-white/65 md:flex-row">
          <p>© 2026 Athlitix. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#contact" className="hover:text-white">Contact</a>
            <Link to="/scores" className="hover:text-white">Scores</Link>
            <a href="#" className="hover:text-white">Privacy Policy</a>
            <a href="#" className="hover:text-white">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
