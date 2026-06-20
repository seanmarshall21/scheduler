import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// Magic-link sign in. On a phone each person signs in with their own email; the
// kitchen kiosk signs in once with a shared household email and stays logged in.
export default function SignIn() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/icons/icon.svg" alt="" className="h-14 w-14" />
          <h1 className="mt-3 text-2xl font-bold text-text">Commons</h1>
          <p className="mt-1 text-sm text-text-2">Your family's shared calendar, tasks & notes.</p>
        </div>
        {sent ? (
          <div className="cd-card text-center">
            <p className="text-sm text-text">Check your email for a magic link to sign in.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="cd-card flex flex-col gap-3">
            <label className="cd-mono-label">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@home.com"
              className="cd-input"
            />
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button type="submit" disabled={busy} className="cd-btn cd-btn--accent cd-btn--kiosk">
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
