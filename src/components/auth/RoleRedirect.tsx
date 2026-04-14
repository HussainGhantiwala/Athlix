import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getTargetPath } from '@/lib/auth-routing';
import { LoadingScreen } from '@/components/auth/LoadingScreen';

interface RoleRedirectProps {
  target?: string;
}

/**
 * Redirects users to their role-specific dashboard or module page
 */
export function RoleRedirect({ target }: RoleRedirectProps) {
  const { role, profile, universityId, isSuperAdmin, isReady } = useAuth();

  if (!isReady) {
    return <LoadingScreen message="Redirecting..." />;
  }

  if (isSuperAdmin || role === 'super_admin') {
    return <Navigate to={getTargetPath('super_admin', target, true)} replace />;
  }

  if (universityId) {
    return <Navigate to={getTargetPath(role || 'student', target, false)} replace />;
  }

  if (profile && !profile.university_id) {
    return <Navigate to="/register-university" replace />;
  }

  if (!universityId) {
    return <Navigate to="/auth" replace />;
  }

  return <Navigate to={getTargetPath(role || 'student', target, false)} replace />;
}
