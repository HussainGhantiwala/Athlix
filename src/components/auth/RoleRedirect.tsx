import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getTargetPath } from '@/lib/auth-routing';
import { LoadingScreen } from '@/components/auth/LoadingScreen';

interface RoleRedirectProps {
  target?: string;
}

export function RoleRedirect({ target }: RoleRedirectProps) {
  const {
    role,
    profile,
    universityId,
    isSuperAdmin,
    isReady,
    isProfileLoaded,
    needsUniversitySetup,
    loading,
  } = useAuth();

  // 🔥 1. WAIT until EVERYTHING is ready (prevents wrong redirects)
  if (!isReady || loading || !isProfileLoaded) {
    return <LoadingScreen message="Loading your dashboard..." />;
  }

  // 🔥 2. SUPER ADMIN → global dashboard
  if (isSuperAdmin || role === 'super_admin') {
    return <Navigate to={getTargetPath('super_admin', target, true)} replace />;
  }

  // 🔥 3. USER HAS UNIVERSITY → go to their dashboard
  if (universityId) {
    return (
      <Navigate
        to={getTargetPath(role || 'student', target, false)}
        replace
      />
    );
  }

  // 🔥 4. USER LOGGED IN BUT NO UNIVERSITY → setup required
  if (needsUniversitySetup || (profile && !profile.university_id)) {
    return <Navigate to="/register-university" replace />;
  }

  // 🔥 5. FALLBACK → go to login
  return <Navigate to="/auth" replace />;
}