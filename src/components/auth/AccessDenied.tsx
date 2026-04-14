import { ShieldAlert } from 'lucide-react';

interface AccessDeniedProps {
  title?: string;
  description?: string;
}

export function AccessDenied({
  title = 'Access Denied',
  description = 'You do not have permission to view this page.',
}: AccessDeniedProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="dashboard-card max-w-md p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-display font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
