import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getRoleHomePath } from '@/lib/auth-routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RegisterUniversity() {
  const navigate = useNavigate();
  const {
    user,
    profile,
    universityId,
    role,
    isSuperAdmin,
    refreshUserContext,
    isReady,
  } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    universityName: '',
    domain: '',
    adminName: '',
    adminEmail: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (isSuperAdmin) {
      navigate('/super-admin', { replace: true });
      return;
    }

    if (profile?.university_id || universityId) {
      navigate(getRoleHomePath(role || 'student', false), { replace: true });
    }
  }, [isReady, isSuperAdmin, navigate, profile?.university_id, role, universityId]);

  useEffect(() => {
    if (user) {
      setFormData((current) => ({
        ...current,
        adminName: current.adminName || profile?.full_name || '',
        adminEmail: current.adminEmail || user.email || '',
      }));
    }
  }, [profile?.full_name, user]);

  const isLoggedInWithoutUniversity = useMemo(
    () => !!user && !universityId && !isSuperAdmin,
    [isSuperAdmin, universityId, user]
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!formData.universityName || !formData.domain || !formData.adminName || !formData.adminEmail) {
      toast.error('Please fill in all required fields.');
      return;
    }

    if (!isLoggedInWithoutUniversity) {
      if (formData.password.length < 6) {
        toast.error('Password must be at least 6 characters.');
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        toast.error('Passwords do not match.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isLoggedInWithoutUniversity) {
        const { error } = await supabase.rpc('register_current_user_university' as any, {
          _name: formData.universityName,
          _domain: formData.domain.toLowerCase().trim(),
        });

        if (error) throw error;

        await refreshUserContext();
        toast.success('University created. You are now the admin for this tenant.');
        navigate('/admin', { replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email: formData.adminEmail.trim(),
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: formData.adminName.trim(),
              registration_mode: 'register_university',
              university_name: formData.universityName.trim(),
              university_domain: formData.domain.toLowerCase().trim(),
            },
          },
        });

        if (error) throw error;

        toast.success('University registration started. Verify your email, then sign in to continue.');
        navigate('/auth', { replace: true });
      }
    } catch (error: any) {
      toast.error(error.message || 'Unable to register university.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady) {
    return (
      <div className="min-h-screen hero-gradient flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl accent-gradient shadow-accent mb-4">
            <Building2 className="h-8 w-8 text-accent-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold text-primary-foreground">Register University</h1>
          <p className="text-primary-foreground/70 mt-2">
            Create a dedicated Athlitix workspace for your institution.
          </p>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle>University Setup</CardTitle>
            <CardDescription>
              {isLoggedInWithoutUniversity
                ? 'Finish setup for your current account.'
                : 'Create a university and assign the first admin account.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="universityName">University Name</Label>
                <Input
                  id="universityName"
                  value={formData.universityName}
                  onChange={(e) => setFormData((current) => ({ ...current, universityName: e.target.value }))}
                  placeholder="Pimpri Chinchwad University"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain">University Domain</Label>
                <Input
                  id="domain"
                  value={formData.domain}
                  onChange={(e) => setFormData((current) => ({ ...current, domain: e.target.value }))}
                  placeholder="pcu.edu.in"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="adminName">Admin Name</Label>
                  <Input
                    id="adminName"
                    value={formData.adminName}
                    onChange={(e) => setFormData((current) => ({ ...current, adminName: e.target.value }))}
                    disabled={isLoggedInWithoutUniversity}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Admin Email</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={formData.adminEmail}
                    onChange={(e) => setFormData((current) => ({ ...current, adminEmail: e.target.value }))}
                    disabled={isLoggedInWithoutUniversity}
                    required
                  />
                </div>
              </div>

              {!isLoggedInWithoutUniversity && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData((current) => ({ ...current, password: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData((current) => ({ ...current, confirmPassword: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-accent" />
                  <p>
                    The university domain becomes the automatic tenant-mapping key for future users who sign in with
                    matching email addresses.
                  </p>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Setting up...' : 'Create University'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
