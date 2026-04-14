import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/database';
import { LoadingScreen } from '@/components/auth/LoadingScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
  allowUnassigned?: boolean;
}

export function ProtectedRoute({ children, requiredRole, allowUnassigned = false }: ProtectedRouteProps) {
  const { user, hasRole, needsUniversitySetup, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!allowUnassigned && needsUniversitySetup) {
    return <Navigate to="/register-university" replace />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
