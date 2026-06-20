import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

// First-run onboarding: create the household. Members get added afterwards in
// Settings (or via the seed script).
export default function Welcome() {
  const { household, createHousehold, loading } = useApp();
  const [name, setName] = useState('Our Home');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const navigate = useNavigate();

  if (!loading && household) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await createHousehold(name);
      navigate('/settings');
    } catch (e) {
      setErr(e?.message || 'Could not create your home. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-text">Set up your home</h1>
          <p className="mt-1 text-sm text-text-2">Name your household — you'll add family members next.</p>
        </div>
        <div className="cd-card flex flex-col gap-3">
          <label className="cd-mono-label">Household name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="cd-input" placeholder="The Smiths" />
          <button type="submit" disabled={busy} className="cd-btn cd-btn--accent cd-btn--kiosk">
            {busy ? 'Creating…' : 'Create home'}
          </button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      </form>
    </div>
  );
}
