import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '@/hooks/useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data: user, isPending, isError } = useMe();

  if (isPending) return <p className="text-muted-foreground p-6">Loading...</p>;
  // Can't reach the server: the offline banner explains why; don't bounce to /login.
  if (isError) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
