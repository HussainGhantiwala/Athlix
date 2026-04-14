import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getRoleHomePath } from '@/lib/auth-routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Trophy, Mail, Lock, User, ArrowRight, Loader2, Database } from 'lucide-react';
import { Link } from 'react-router-dom';

export function AuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const {
    signIn,
    signUp,
    user,
    profile,
    role,
    isSuperAdmin,
    universityId,
    isReady,
    isProfileLoaded,
  } = useAuth();
  const navigate = useNavigate();

  // Redirect logged-in users to their role-specific dashboard
  useEffect(() => {
    if (!isReady || !user) {
      return;
    }

    if (isSuperAdmin || role === 'super_admin') {
      navigate('/super-admin', { replace: true });
      return;
    }

    if (universityId) {
      navigate(getRoleHomePath(role || 'student', false), { replace: true });
      return;
    }

    if (isProfileLoaded && profile && !profile.university_id) {
      navigate('/register-university', { replace: true });
    }
  }, [user, profile, role, navigate, isSuperAdmin, universityId, isReady, isProfileLoaded]);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form state
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(loginEmail, loginPassword);
    
    if (error) {
      toast.error(error.message);
      setIsLoading(false);
    } else {
      toast.success('Welcome back!');
      // Navigation happens via useEffect when user/role state updates
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (signupPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (signupPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    const { error } = await signUp(signupEmail, signupPassword, signupName);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Account created! Please check your email to verify your account.');
    }
    
    setIsLoading(false);
  };

  // Show loading while checking auth state
  if (!isReady) {
    return (
      <div className="min-h-screen hero-gradient flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto mb-4" />
          <p className="text-primary-foreground/70">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl accent-gradient shadow-accent mb-4">
            <Trophy className="w-8 h-8 text-accent-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold text-primary-foreground">
            Athletix
          </h1>
          <p className="text-primary-foreground/70 mt-2">
            University Sports Management System
          </p>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-display text-center">Welcome</CardTitle>
            <CardDescription className="text-center">
              Sign in to your account or create a new one
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@university.edu"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Signing in...' : 'Sign In'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="John Doe"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@university.edu"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Create Account'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-primary-foreground/50 mt-6">
          By signing up, you agree to our Terms of Service and Privacy Policy
        </p>

        <p className="text-center text-sm text-primary-foreground/70 mt-4">
          New university?
          {' '}
          <Link to="/register-university" className="underline underline-offset-4">
            Create a university workspace
          </Link>
        </p>

        {/* Dev Seeder */}
        <div className="mt-6 p-4 rounded-lg border border-primary-foreground/10 bg-primary-foreground/5">
          <p className="text-xs text-primary-foreground/50 mb-3 text-center font-medium">DEV MODE — Seed Test Users</p>
          <Button
            variant="outline"
            size="sm"
            className="w-full mb-3 border-primary-foreground/20 text-primary-foreground/70 hover:text-primary-foreground"
            onClick={async () => {
              toast.info('Seeding dev users...');
              try {
                const { data, error } = await supabase.functions.invoke('seed-dev-users');
                if (error) throw error;
                toast.success('Dev users seeded successfully!');
                console.log('Seed results:', data);
              } catch (err: any) {
                toast.error(err.message || 'Failed to seed users');
              }
            }}
          >
            <Database className="h-4 w-4 mr-2" />
            Seed Dev Users
          </Button>
          <div className="grid grid-cols-2 gap-2 text-xs text-primary-foreground/50">
            <div><strong>Super:</strong> superadmin@athletix.dev</div>
            <div><strong>Admin:</strong> admin@athletix.dev</div>
            <div><strong>Faculty:</strong> faculty@athletix.dev</div>
            <div><strong>Coordinator:</strong> coordinator@athletix.dev</div>
            <div><strong>Student:</strong> student@athletix.dev</div>
          </div>
          <p className="text-xs text-primary-foreground/40 mt-2 text-center">Password: SuperAdmin@123 or [Role]@123</p>
        </div>
      </div>
    </div>
  );
}
