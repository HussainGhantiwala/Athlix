import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getTargetPath } from '@/lib/auth-routing';
import { LoadingScreen } from '@/components/auth/LoadingScreen';

export function RoleRedirect({ target }: { target?: string }) {
  const {
    user,
    role,
    profile,
    isSuperAdmin,
    isReady,
    profileLoading,
    isProfileLoaded
  } = useAuth();

  if (!isReady || profileLoading || !isProfileLoaded) {
    return <LoadingScreen message="Loading your dashboard..." />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (isSuperAdmin || role === 'super_admin') {
    return <Navigate to={getTargetPath('super_admin', target, true)} replace />;
  }

  if (profile && !profile.university_id) {
    return <Navigate to="/register-university" replace />;
  }

  return (
    <Navigate
      to={getTargetPath(role || 'student', target, false)}
      replace
    />
  );
}