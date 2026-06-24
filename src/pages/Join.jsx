import { Navigate, useSearchParams } from 'react-router-dom';

// Landing for an "Open the Door" invite link (/join?key=ABC123). Stash the
// Commons Key, then bounce to "/" — ProtectedRoute handles sign-in, and
// AppContext applies the pending key on load (joining the shared household).
export default function Join() {
  const [params] = useSearchParams();
  const key = params.get('key');
  if (key) sessionStorage.setItem('commons.pendingJoinKey', key);
  return <Navigate to="/" replace />;
}
