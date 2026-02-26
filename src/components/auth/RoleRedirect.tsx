import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface RoleRedirectProps {
  target?: string;
}

/**
 * Redirects users to their role-specific dashboard or module page
 */
export function RoleRedirect({ target }: RoleRedirectProps) {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    );
  }

  // Determine the base path based on role
  const getBasePath = () => {
    switch (role) {
      case 'admin':
        return '/admin';
      case 'faculty':
        return '/faculty';
      case 'student_coordinator':
        return '/coordinator';
      case 'student':
      default:
        return '/student';
    }
  };

  const basePath = getBasePath();
  
  // If no target specified, redirect to dashboard
  if (!target) {
    return <Navigate to={basePath} replace />;
  }

  // Redirect to the appropriate role-specific page
  return <Navigate to={`${basePath}/${target}`} replace />;
}
