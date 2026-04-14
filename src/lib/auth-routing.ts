import { AppRole } from '@/types/database';

export const roleHierarchy: Record<AppRole, number> = {
  super_admin: 5,
  admin: 4,
  faculty: 3,
  student_coordinator: 2,
  student: 1,
};

export function getRoleHomePath(role: AppRole | null, isSuperAdmin = false) {
  if (isSuperAdmin || role === 'super_admin') {
    return '/super-admin';
  }

  switch (role) {
    case 'admin':
      return '/admin';
    case 'faculty':
      return '/faculty';
    case 'student_coordinator':
      return '/coordinator';
    case 'student':
      return '/student';
    default:
      return '/dashboard';
  }
}

export function getTargetPath(role: AppRole | null, target?: string, isSuperAdmin = false) {
  const basePath = getRoleHomePath(role, isSuperAdmin);
  if (!target || basePath === '/dashboard') {
    return basePath;
  }

  if (basePath === '/super-admin') {
    switch (target) {
      case 'events':
        return '/admin/events';
      case 'teams':
        return '/admin/teams';
      case 'matches':
        return '/admin/matches';
      case 'registrations':
        return '/admin/users';
      case 'budgets':
        return '/admin/budgets';
      case 'analytics':
        return '/admin/analytics';
      default:
        return basePath;
    }
  }

  return `${basePath}/${target}`;
}
