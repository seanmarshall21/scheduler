import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// Sign in with Google (one tap) or email + password. On a phone each person
// signs in with their own account; the kitchen kiosk signs in once with a
// shared household account and stays logged in.
function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export default function SignIn() {
  const { session } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const signInGoogle = async () => {
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    // On success the browser redirects to Google; we only get here on error.
    if (error) setErr(error.message);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const creds = { email: email.trim(), password };
    const { error } =
      mode === 'signup'
        ? await supabase.auth.signUp(creds)
        : await supabase.auth.signInWithPassword(creds);
    setBusy(false);
    // On success, AuthContext's onAuthStateChange picks up the session and the
    // router redirects. Surface any error.
    if (error) setErr(error.message);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/icons/icon.svg" alt="" className="h-14 w-14" />
          <h1 className="mt-3 text-2xl font-bold text-text">Commons</h1>
          <p className="mt-1 text-sm text-text-2">Your family's shared calendar, tasks &amp; notes.</p>
        </div>

        <div className="cd-card flex flex-col gap-3">
          <button
            type="button"
            onClick={signInGoogle}
            className="cd-btn cd-btn--kiosk flex items-center justify-center gap-2 border border-surface-3 bg-surface-0 text-text"
          >
            <GoogleMark />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-surface-3" />
            <span className="cd-mono-label">or</span>
            <span className="h-px flex-1 bg-surface-3" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <label className="cd-mono-label">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@home.com"
                className="cd-input mt-1.5"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="cd-mono-label">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="cd-input mt-1.5"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button type="submit" disabled={busy} className="cd-btn cd-btn--accent cd-btn--kiosk">
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'signup' ? 'signin' : 'signup'));
              setErr(null);
            }}
            className="text-center text-xs text-text-2 hover:text-text"
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : "New here? Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}
