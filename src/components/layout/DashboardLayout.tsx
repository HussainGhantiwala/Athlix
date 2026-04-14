import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Trophy,
  LayoutDashboard,
  Building2,
  Calendar,
  Users,
  ClipboardList,
  Target,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  UserCircle,
  Bell,
  FileText,
  UserPlus,
  PenTool,
  ListChecks,
  Inbox,
  BookOpen,
} from 'lucide-react';
import { AppRole } from '@/types/database';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

// Role-specific navigation items
const getNavItemsForRole = (role: AppRole | null, isSuperAdmin: boolean): NavItem[] => {
  if (isSuperAdmin) {
    return [
      { label: 'Dashboard', href: '/super-admin', icon: <LayoutDashboard className="h-5 w-5" /> },
      { label: 'Universities', href: '/admin/universities', icon: <Building2 className="h-5 w-5" /> },
      { label: 'Events', href: '/admin/events', icon: <Calendar className="h-5 w-5" /> },
      { label: 'Teams', href: '/admin/teams', icon: <Users className="h-5 w-5" /> },
      { label: 'Matches', href: '/admin/matches', icon: <Target className="h-5 w-5" /> },
      { label: 'Budgets', href: '/admin/budgets', icon: <DollarSign className="h-5 w-5" /> },
      { label: 'Analytics', href: '/admin/analytics', icon: <BarChart3 className="h-5 w-5" /> },
      { label: 'Reports', href: '/admin/reports', icon: <FileText className="h-5 w-5" /> },
    ];
  }

  switch (role) {
    case 'admin':
      return [
        { label: 'Dashboard', href: '/admin', icon: <LayoutDashboard className="h-5 w-5" /> },
        { label: 'Events', href: '/admin/events', icon: <Calendar className="h-5 w-5" /> },
        { label: 'Users & Invites', href: '/admin/coordinators', icon: <UserPlus className="h-5 w-5" /> },
        { label: 'Form Approval', href: '/admin/form-approval', icon: <ListChecks className="h-5 w-5" /> },
        { label: 'Submissions', href: '/admin/submissions', icon: <Inbox className="h-5 w-5" /> },
        { label: 'Rule Book', href: '/admin/rule-book', icon: <BookOpen className="h-5 w-5" /> },
        { label: 'Teams', href: '/admin/teams', icon: <Users className="h-5 w-5" /> },
        { label: 'Matches', href: '/admin/matches', icon: <Target className="h-5 w-5" /> },
        { label: 'Budgets', href: '/admin/budgets', icon: <DollarSign className="h-5 w-5" /> },
        { label: 'Analytics', href: '/admin/analytics', icon: <BarChart3 className="h-5 w-5" /> },
        { label: 'Reports', href: '/admin/reports', icon: <FileText className="h-5 w-5" /> },
      ];
    case 'faculty':
      return [
        { label: 'Dashboard', href: '/faculty', icon: <LayoutDashboard className="h-5 w-5" /> },
        { label: 'Events', href: '/faculty/events', icon: <Calendar className="h-5 w-5" /> },
        { label: 'Reg. Review', href: '/faculty/registration-review', icon: <ClipboardList className="h-5 w-5" /> },
        { label: 'Submissions', href: '/faculty/submissions', icon: <Inbox className="h-5 w-5" /> },
        { label: 'Rule Book', href: '/faculty/rule-book', icon: <BookOpen className="h-5 w-5" /> },
        { label: 'Teams', href: '/faculty/teams', icon: <Users className="h-5 w-5" /> },
        { label: 'Matches', href: '/faculty/matches', icon: <Target className="h-5 w-5" /> },
        { label: 'Registrations', href: '/faculty/registrations', icon: <ClipboardList className="h-5 w-5" /> },
        { label: 'Budgets', href: '/faculty/budgets', icon: <DollarSign className="h-5 w-5" /> },
      ];
    case 'student_coordinator':
      return [
        { label: 'Dashboard', href: '/coordinator', icon: <LayoutDashboard className="h-5 w-5" /> },
        { label: 'Score Control', href: '/coordinator/score-control', icon: <Target className="h-5 w-5" /> },
        { label: 'Matches', href: '/coordinator/matches', icon: <Target className="h-5 w-5" /> },
        { label: 'Teams', href: '/coordinator/teams', icon: <Users className="h-5 w-5" /> },
        { label: 'Analytics', href: '/coordinator/analytics', icon: <BarChart3 className="h-5 w-5" /> },
        { label: 'Reports', href: '/coordinator/reports', icon: <FileText className="h-5 w-5" /> },
        { label: 'Form Builder', href: '/coordinator/form-builder', icon: <PenTool className="h-5 w-5" /> },
        { label: 'Submissions', href: '/coordinator/submissions', icon: <Inbox className="h-5 w-5" /> },
        { label: 'Rule Book', href: '/coordinator/rule-book', icon: <BookOpen className="h-5 w-5" /> },
      ];
    case 'student':
    default:
      return [
        { label: 'Dashboard', href: '/student', icon: <LayoutDashboard className="h-5 w-5" /> },
        { label: 'Open Registrations', href: '/student/open-registrations', icon: <PenTool className="h-5 w-5" /> },
        { label: 'Rule Book', href: '/student/rule-book', icon: <BookOpen className="h-5 w-5" /> },
        { label: 'Events', href: '/student/events', icon: <Calendar className="h-5 w-5" /> },
        { label: 'My Teams', href: '/student/teams', icon: <Users className="h-5 w-5" /> },
        { label: 'My Registrations', href: '/student/registrations', icon: <ClipboardList className="h-5 w-5" /> },
        { label: 'Matches', href: '/student/matches', icon: <Target className="h-5 w-5" /> },
      ];
  }
};

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { profile, role, university, signOut, isSuperAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = getNavItemsForRole(role, isSuperAdmin);

  const handleSignOut = async () => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    await signOut();
    navigate('/', { replace: true });
  };

  const getRoleBadgeColor = () => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/20 text-red-300';
      case 'super_admin':
        return 'bg-violet-500/20 text-violet-200';
      case 'faculty':
        return 'bg-blue-500/20 text-blue-300';
      case 'student_coordinator':
        return 'bg-amber-500/20 text-amber-300';
      default:
        return 'bg-green-500/20 text-green-300';
    }
  };

  const getRoleLabel = () => {
    switch (role) {
      case 'admin':
        return 'University Admin';
      case 'super_admin':
        return 'Super Admin';
      case 'faculty':
        return 'Faculty Coordinator';
      case 'student_coordinator':
        return 'Student Coordinator';
      default:
        return 'Student';
    }
  };

  const isActiveLink = (href: string) => {
    if (href === location.pathname) return true;
    // Check if current path starts with the nav item's href (for nested routes)
    if (href !== '/' && location.pathname.startsWith(href + '/')) return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-sidebar transform transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl accent-gradient">
              <Trophy className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-sidebar-foreground">
                Athletix
              </h1>
              <p className="text-xs text-sidebar-foreground/60">
                {university?.short_name || getRoleLabel()}
              </p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 overflow-y-auto">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const isActive = isActiveLink(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-primary'
                          : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Public Scoreboard Link */}
          <div className="px-3 pb-2">
            <Link
              to="/"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all"
              onClick={() => setSidebarOpen(false)}
            >
              <Trophy className="h-5 w-5" />
              <span>Public Scoreboard</span>
            </Link>
          </div>

          {/* User section */}
          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-2">
              <Avatar className="h-9 w-9">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-sm">
                  {profile?.full_name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {profile?.full_name || 'User'}
                </p>
                <span
                  className={cn(
                    'inline-block px-2 py-0.5 text-xs rounded-full font-medium',
                    getRoleBadgeColor()
                  )}
                >
                  {getRoleLabel()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 lg:px-6 bg-background/80 backdrop-blur-xl border-b border-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url} />
                    <AvatarFallback className="text-sm">
                      {profile?.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{profile?.full_name}</p>
                    <p className="text-xs text-muted-foreground">{profile?.email}</p>
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 text-xs rounded-full font-medium w-fit mt-1',
                        getRoleBadgeColor()
                      )}
                    >
                      {getRoleLabel()}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <UserCircle className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive" disabled={signingOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {signingOut ? 'Signing out...' : 'Sign out'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
