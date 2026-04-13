import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { getTargetPath } from '@/lib/auth-routing';

interface RoleRedirectProps {
  target?: string;
}

/**
 * Redirects users to their role-specific dashboard or module page
 */
export function RoleRedirect({ target }: RoleRedirectProps) {
  const { role, universityId, isSuperAdmin, isReady } = useAuth();

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (isSuperAdmin || role === 'super_admin') {
    return <Navigate to={getTargetPath('super_admin', target, true)} replace />;
  }

  if (universityId) {
    return <Navigate to={getTargetPath(role || 'student', target, false)} replace />;
  }

  if (!universityId) {
    return <Navigate to="/register-university" replace />;
  }

  return <Navigate to={getTargetPath(role || 'student', target, false)} replace />;
}
