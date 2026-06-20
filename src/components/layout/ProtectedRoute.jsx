import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';

// Gate: must be signed in. If signed in but no household yet, go to onboarding.
export default function ProtectedRoute() {
  const { session, loading: authLoading } = useAuth();
  const { needsOnboarding, loading: appLoading } = useApp();

  if (authLoading || appLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="cd-mono-label animate-pulse">loading…</span>
      </div>
    );
  }
  if (!session) return <Navigate to="/signin" replace />;
  if (needsOnboarding) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}
