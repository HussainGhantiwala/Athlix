import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Shield, UserPlus, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, Invite, Profile, UserRole } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const roleOptions: AppRole[] = ['admin', 'faculty', 'student_coordinator', 'student'];

interface MemberRow extends Profile {
  role: AppRole | null;
}

export default function AdminCoordinators() {
  const { universityId, university, refreshUserContext } = useAuth();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('faculty');
  const [savingRoleFor, setSavingRoleFor] = useState<string | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);

  const loadPage = async () => {
    if (!universityId) return;

    setLoading(true);

    const [profilesResult, rolesResult, invitesResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('university_id', universityId)
        .order('full_name'),
      supabase
        .from('user_roles')
        .select('*')
        .eq('university_id', universityId),
      supabase
        .from('invites' as any)
        .select('*')
        .eq('university_id', universityId)
        .order('created_at', { ascending: false }),
    ]);

    const roleMap = new Map<string, UserRole[]>();
    ((rolesResult.data as UserRole[] | null) ?? []).forEach((entry) => {
      const current = roleMap.get(entry.user_id) ?? [];
      current.push(entry);
      roleMap.set(entry.user_id, current);
    });

    const resolvedMembers = ((profilesResult.data as Profile[] | null) ?? []).map((member) => {
      const roles = roleMap.get(member.id) ?? [];
      const highest = roles.sort((a, b) => roleOptions.indexOf(a.role) - roleOptions.indexOf(b.role))[0];
      return {
        ...member,
        role: highest?.role ?? null,
      };
    });

    setMembers(resolvedMembers);
    setPendingInvites((invitesResult.data as Invite[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void loadPage();
  }, [universityId]);

  const pendingInviteRows = useMemo(
    () => pendingInvites.filter((invite) => invite.status === 'pending'),
    [pendingInvites]
  );

  const handleSendInvite = async () => {
    if (!universityId || !inviteEmail.trim()) {
      toast.error('Enter an email address first.');
      return;
    }

    setSendingInvite(true);
    const { error } = await supabase.from('invites' as any).insert({
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      university_id: universityId,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Invite sent.');
      setInviteEmail('');
      setInviteRole('faculty');
      await loadPage();
    }

    setSendingInvite(false);
  };

  const handleRoleChange = async (userId: string, nextRole: AppRole) => {
    if (!universityId) return;

    setSavingRoleFor(userId);

    const existingRows = ((await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('university_id', universityId)).data ?? []) as Array<{ id: string }>;

    if (existingRows.length > 0) {
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('university_id', universityId);

      if (deleteError) {
        toast.error(deleteError.message);
        setSavingRoleFor(null);
        return;
      }
    }

    const { error } = await supabase.from('user_roles').insert({
      user_id: userId,
      university_id: universityId,
      role: nextRole,
    } as any);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Role updated.');
      await refreshUserContext();
      await loadPage();
    }

    setSavingRoleFor(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Users & Invites</h1>
          <p className="text-muted-foreground">
            Manage membership for {university?.name || 'your university'}.
          </p>
        </div>

        <div className="dashboard-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-display font-bold">Invite User</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_220px_auto]">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="faculty@pcu.edu.in"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleSendInvite} disabled={sendingInvite}>
                Send Invite
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="dashboard-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-display font-bold">University Members</h2>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : members.length > 0 ? (
              <div className="space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium">{member.full_name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>

                      <div className="w-full md:w-56">
                        <Select
                          value={member.role || 'student'}
                          onValueChange={(value) => handleRoleChange(member.id, value as AppRole)}
                          disabled={savingRoleFor === member.id}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role.replace('_', ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No university members found yet.</p>
            )}
          </div>

          <div className="dashboard-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-status-live" />
              <h2 className="text-lg font-display font-bold">Pending Invites</h2>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : pendingInviteRows.length > 0 ? (
              <div className="space-y-3">
                {pendingInviteRows.map((invite) => (
                  <div key={invite.id} className="rounded-xl border border-border p-4">
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-sm text-muted-foreground capitalize">{invite.role.replace('_', ' ')}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No pending invites.</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
