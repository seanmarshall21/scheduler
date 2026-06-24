import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

// First-run onboarding: create a new home, OR join an existing one with a
// Commons Key someone shared ("Open the Door").
export default function Welcome() {
  const { household, createHousehold, joinByKey, loading } = useApp();
  const [mode, setMode] = useState('create'); // 'create' | 'join'
  const [name, setName] = useState('Our Home');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const navigate = useNavigate();

  if (!loading && household) return <Navigate to="/" replace />;

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await createHousehold(name);
      navigate('/settings');
    } catch (e2) {
      setErr(e2?.message || 'Could not create your home. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await joinByKey(key);
      navigate('/');
    } catch (e2) {
      setErr(/invalid/i.test(e2?.message || '') ? 'That Commons Key didn’t match a home.' : e2?.message || 'Could not join.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-text">{mode === 'create' ? 'Set up your home' : 'Join a home'}</h1>
          <p className="mt-1 text-sm text-text-2">
            {mode === 'create'
              ? "Name your household — you'll add family members next."
              : 'Enter the Commons Key someone shared with you.'}
          </p>
        </div>

        {mode === 'create' ? (
          <form onSubmit={create} className="cd-card flex flex-col gap-3">
            <label className="cd-mono-label">Household name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="cd-input" placeholder="The Smiths" />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button type="submit" disabled={busy} className="cd-btn cd-btn--accent cd-btn--kiosk">
              {busy ? 'Creating…' : 'Create home'}
            </button>
          </form>
        ) : (
          <form onSubmit={join} className="cd-card flex flex-col gap-3">
            <label className="cd-mono-label">Commons Key</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="cd-input font-mono uppercase tracking-widest"
              placeholder="ABC123"
              autoCapitalize="characters"
              autoComplete="off"
            />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button type="submit" disabled={busy || !key.trim()} className="cd-btn cd-btn--accent cd-btn--kiosk">
              {busy ? 'Joining…' : 'Open the door'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => { setMode(mode === 'create' ? 'join' : 'create'); setErr(null); }}
          className="mt-3 w-full text-center text-xs text-text-2 hover:text-text"
        >
          {mode === 'create' ? 'Have a Commons Key? Join a home instead' : 'Starting fresh? Create your own home'}
        </button>
      </div>
    </div>
  );
}
