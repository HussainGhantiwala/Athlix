import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, Invite, Profile, University, UserRole } from '@/types/database';
import { roleHierarchy } from '@/lib/auth-routing';
import { clearTenantScope } from '@/lib/tenant-scope';
import { measureWithTimeout, REQUEST_TIMEOUT_MS } from '@/lib/performance';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  university: University | null;
  universityId: string | null;
  role: AppRole | null;
  pendingInvites: Invite[];
  loading: boolean;
  /** True once initial session resolution finished (and profile loaded when logged in). Stays true during silent token refresh. */
  isReady: boolean;
  isSessionReady: boolean;
  isProfileLoaded: boolean;
  profileLoading: boolean;
  isSuperAdmin: boolean;
  needsUniversitySetup: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  acceptInvite: (inviteId: string) => Promise<{ error: Error | null }>;
  rejectInvite: (inviteId: string) => Promise<{ error: Error | null }>;
  refreshUserContext: () => Promise<void>;
  hasRole: (requiredRole: AppRole) => boolean;
  isAdmin: boolean;
  isFaculty: boolean;
  isStudentCoordinator: boolean;
  isStudent: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type UserContextSnapshot = {
  profile: Profile | null;
  university: University | null;
  role: AppRole | null;
  pendingInvites: Invite[];
};

function resolveHighestRole(roles: UserRole[], universityId: string | null): AppRole | null {
  const scopedRoles = roles.filter((entry) => entry.role === 'super_admin' || entry.university_id === universityId);

  if (!scopedRoles.length) {
    return null;
  }

  const highest = scopedRoles.reduce((prev, current) =>
    roleHierarchy[current.role] > roleHierarchy[prev.role] ? current : prev
  );

  return highest.role;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [university, setUniversity] = useState<University | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const userContextCacheRef = useRef(new Map<string, UserContextSnapshot>());
  const pendingContextRequestsRef = useRef(new Map<string, Promise<UserContextSnapshot>>());
  const authRequestIdRef = useRef(0);
  const [profileLoading, setProfileLoading] = useState(true);

  const resetState = () => {
    setProfile(null);
    setUniversity(null);
    setRole(null);
    setPendingInvites([]);
  };

  const applyUserContext = (snapshot: UserContextSnapshot) => {
    setProfile(snapshot.profile);
    setUniversity(snapshot.university);
    setRole(snapshot.role);
    setPendingInvites(snapshot.pendingInvites);
  };

  const fetchUserData = async (userId: string, userEmail?: string | null, forceRefresh = false): Promise<UserContextSnapshot> => {
    setProfileLoading(true);

    try {
      if (!forceRefresh) {
        const cached = userContextCacheRef.current.get(userId);
        if (cached) {
          return cached;
        }

        const pending = pendingContextRequestsRef.current.get(userId);
        if (pending) {
          return pending;
        }
      }

      const normalizedEmail = userEmail?.trim().toLowerCase() || null;

      const request = measureWithTimeout(`auth context ${userId}`, async () => {
      const { data: syncData, error: syncError } = await supabase.rpc('sync_user_membership' as any);
      if (syncError) {
        throw syncError;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      const resolvedProfile = (profileRow as Profile | null) ?? null;

      const [profileResult, rolesResult, invitesResult] = await Promise.all([
        resolvedProfile?.university_id
          ? supabase
              .from('universities')
              .select('id, name, short_name, logo_url, domain, address, city, state, country, is_active, created_by, created_at, updated_at')
              .eq('id', resolvedProfile.university_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('user_roles')
          .select('id, user_id, university_id, role, created_at')
          .eq('user_id', userId)
          .limit(10),
        supabase
          .from('invites' as any)
          .select(`
            id,
            email,
            role,
            university_id,
            status,
            created_at,
            university:universities(
              id,
              name,
              short_name,
              logo_url,
              domain,
              address,
              city,
              state,
              country,
              is_active,
              created_by,
              created_at,
              updated_at
            )
          `)
          .eq('status', 'pending')
          .ilike('email', normalizedEmail || '__none__')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (profileResult.error) {
        throw profileResult.error;
      }

      if (rolesResult.error) {
        throw rolesResult.error;
      }

      if (invitesResult.error) {
        throw invitesResult.error;
      }

      const profileData = resolvedProfile;
      const roleData = (rolesResult.data as UserRole[] | null) ?? [];
      const inviteData = (invitesResult.data as unknown as Invite[] | null) ?? [];
      const resolvedUniversity = (profileResult.data as University | null) ?? null;
      const resolvedUniversityId = profileData?.university_id ?? resolvedUniversity?.id ?? null;
      const resolvedRole =
        resolveHighestRole(roleData, resolvedUniversityId) ??
        (syncData?.role as AppRole | null) ??
        null;

      return {
        profile: profileData,
        university: resolvedUniversity,
        role: resolvedRole,
        pendingInvites: inviteData,
      };
      }, REQUEST_TIMEOUT_MS);

      pendingContextRequestsRef.current.set(userId, request);

      try {
        const snapshot = await request;
        userContextCacheRef.current.set(userId, snapshot);
        return snapshot;
      } finally {
        pendingContextRequestsRef.current.delete(userId);
      }
    } finally {
      setProfileLoading(false);
      setIsProfileLoaded(true);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const resolveSession = async (
      nextSession: Session | null,
      source: string,
      options?: { forceRefresh?: boolean }
    ) => {
      const requestId = ++authRequestIdRef.current;
      const resolvedUser = nextSession?.user ?? null;
      const forceRefresh = options?.forceRefresh ?? false;

      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setUser(resolvedUser);

      if (!resolvedUser) {
        resetState();
        clearTenantScope();
        if (requestId === authRequestIdRef.current) {
          setIsSessionReady(true);
          setIsProfileLoaded(true);
          setIsReady(true);
        }
        return;
      }

      setIsSessionReady(true);
      setIsProfileLoaded(false);
      setIsReady(false);
      setProfileLoading(true);
      try {
        const snapshot = await fetchUserData(resolvedUser.id, resolvedUser.email, forceRefresh);
        if (!isMounted || requestId !== authRequestIdRef.current) {
          return;
        }

        applyUserContext(snapshot);
      } catch (error) {
        console.error(`Error resolving auth state from ${source}:`, error);
        if (!isMounted || requestId !== authRequestIdRef.current) {
          return;
        }
        resetState();
      } finally {
        if (isMounted && requestId === authRequestIdRef.current) {
          setIsProfileLoaded(true);
          setIsReady(true);
          setProfileLoading(false);
        }
      }
    };

    const loadingTimeoutId = window.setTimeout(() => {
      if (!isMounted) {
        return;
      }

      console.warn(`[perf] auth initialization exceeded ${REQUEST_TIMEOUT_MS}ms; waiting for profile context before redirecting`);
    }, REQUEST_TIMEOUT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (newSession?.user) {
        setIsReady(false);
        setProfileLoading(true);
        setIsProfileLoaded(false);
      }

      await resolveSession(newSession, `auth:${event}`, {
        forceRefresh: event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED',
      });
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session: existingSession } }) => resolveSession(existingSession, 'getSession'))
      .catch((error) => {
        console.error('Error loading session:', error);
        if (isMounted) {
          setProfileLoading(false);
          setIsSessionReady(true);
          setIsProfileLoaded(true);
          setIsReady(true);
        }
      });

    return () => {
      isMounted = false;
      window.clearTimeout(loadingTimeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const refreshUserContext = async () => {
    if (!user?.id) return;

    setProfileLoading(true);
    setIsProfileLoaded(false);
    setIsReady(false);

    try {
      userContextCacheRef.current.delete(user.id);
      clearTenantScope(profile?.university_id ?? university?.id ?? undefined);
      const snapshot = await fetchUserData(user.id, user.email, true);
      applyUserContext(snapshot);
    } finally {
      setProfileLoading(false);
      setIsProfileLoaded(true);
      setIsReady(true);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    resetState();
    setProfileLoading(false);
    setIsSessionReady(true);
    setIsProfileLoaded(true);
    setIsReady(true);
    userContextCacheRef.current.clear();
    pendingContextRequestsRef.current.clear();
    clearTenantScope();
    void supabase.auth.signOut().catch((error) => {
      console.error('Error signing out:', error);
    });
  };

  const acceptInvite = async (inviteId: string) => {
    const { error } = await supabase.rpc('accept_invite' as any, { _invite_id: inviteId });

    if (!error) {
      await refreshUserContext();
    }

    return { error };
  };

  const rejectInvite = async (inviteId: string) => {
    const { error } = await supabase
      .from('invites' as any)
      .update({ status: 'rejected' })
      .eq('id', inviteId);

    if (!error) {
      await refreshUserContext();
    }

    return { error };
  };

  const hasRole = (requiredRole: AppRole): boolean => {
    if (!role) return false;
  
    // Super admin can access everything
    if (role === 'super_admin') return true;
  
    // Only allow super_admin check explicitly
    if (requiredRole === 'super_admin') return false;
  
    return roleHierarchy[role] >= roleHierarchy[requiredRole];
  };

  const isSuperAdmin = role === 'super_admin';
  const universityId = profile?.university_id ?? university?.id ?? null;
  const needsUniversitySetup =
    !!user &&
    isProfileLoaded &&
    !!profile &&
    !isSuperAdmin &&
    !profile?.university_id &&
    pendingInvites.length === 0;
  const loading = !isReady;

  const value = useMemo(() => ({
    user,
    session,
    profile,
    university,
    universityId,
    role,
    pendingInvites,
    loading,
    isReady,
    isSessionReady,
    isProfileLoaded,
    profileLoading,
    isSuperAdmin,
    needsUniversitySetup,
    signIn,
    signUp,
    signOut,
    acceptInvite,
    rejectInvite,
    refreshUserContext,
    hasRole,
    isAdmin: role === 'admin',
    isFaculty: role === 'faculty' || role === 'admin' || role === 'super_admin',
    isStudentCoordinator:
      role === 'student_coordinator' || role === 'faculty' || role === 'admin' || role === 'super_admin',
    isStudent: !!role,
  }), [
    user,
    session,
    profile,
    university,
    universityId,
    role,
    pendingInvites,
    loading,
    isReady,
    isSessionReady,
    isProfileLoaded,
    isSuperAdmin,
    needsUniversitySetup,
    profileLoading,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
