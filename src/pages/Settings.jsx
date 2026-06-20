import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useMembers } from '../hooks/useMembers';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { useWorkSchedule } from '../hooks/useWorkSchedule';
import MemberChip from '../components/members/MemberChip';

const PALETTE = ['#e0603c', '#3c8fe0', '#3ca06a', '#9b5de5', '#e0a83c', '#e05c9e', '#3ca6a0', '#7a6f5f'];

export default function Settings() {
  const { household, activeMemberId } = useApp();
  const { signOut } = useAuth();
  const { members, addMember, updateMember, deactivateMember } = useMembers();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);

  const gcal = useGoogleCalendar();
  const work = useWorkSchedule();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connectMemberId, setConnectMemberId] = useState(activeMemberId || '');

  // Finish the OAuth handshake when Google redirects back to /settings.
  useEffect(() => {
    const code = searchParams.get('code');
    if (code && searchParams.get('state') === 'gcal') {
      gcal.exchangeCode(code).finally(() => setSearchParams({}, { replace: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const add = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addMember({ name: newName.trim(), color: newColor });
    setNewName('');
    setNewColor(PALETTE[(members.length + 1) % PALETTE.length]);
  };

  const targetMember = connectMemberId || members[0]?.id || '';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-3 md:p-4">
      <section className="cd-card">
        <h2 className="mb-1 text-base font-bold text-text">{household?.name}</h2>
        <p className="cd-mono-label">household</p>
      </section>

      {/* Members */}
      <section className="cd-card flex flex-col gap-3">
        <h2 className="text-base font-bold text-text">Family members</h2>
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-btn border border-surface-3 p-2">
              <MemberChip member={m} size={36} />
              <input
                defaultValue={m.name}
                onBlur={(e) => e.target.value !== m.name && updateMember(m.id, { name: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-text focus:outline-none"
              />
              <div className="flex gap-1">
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => updateMember(m.id, { color: c })}
                    className={`h-5 w-5 rounded-full transition-transform ${m.color === c ? 'scale-110 ring-2 ring-offset-1' : ''}`}
                    style={{ backgroundColor: c }} aria-label={`color ${c}`} />
                ))}
              </div>
              <button onClick={() => deactivateMember(m.id)} className="text-text-3 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        <form onSubmit={add} className="flex items-center gap-2 border-t border-surface-2 pt-3">
          <span className="flex gap-1">
            {PALETTE.slice(0, 6).map((c) => (
              <button key={c} type="button" onClick={() => setNewColor(c)}
                className={`h-5 w-5 rounded-full ${newColor === c ? 'ring-2 ring-offset-1' : ''}`} style={{ backgroundColor: c }} />
            ))}
          </span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a member…" className="cd-input flex-1 !py-2" />
          <button type="submit" className="cd-btn cd-btn--accent shrink-0"><Plus className="h-4 w-4" /></button>
        </form>
      </section>

      {/* Google Calendar */}
      <section className="cd-card flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-text">Google Calendar</h2>
          <p className="mt-1 text-sm text-text-2">
            Connect each person's Google account so their events show on the board, color-coded per member.
            Choose to show full detail or just busy time, and pick which calendars appear.
          </p>
        </div>

        {!gcal.configured ? (
          <p className="rounded-btn border border-surface-3 bg-surface-1 p-3 text-sm text-text-2">
            Not configured yet — add <code className="font-mono text-xs">VITE_GOOGLE_CLIENT_ID</code> (plus the
            function secrets) and set up the Google OAuth client to enable connecting accounts.
          </p>
        ) : (
          <>
            {gcal.error && <p className="text-xs text-red-600">{gcal.error}</p>}

            {/* Connect a new account, attached to a member */}
            <div className="flex items-center gap-2">
              <select
                value={targetMember}
                onChange={(e) => setConnectMemberId(e.target.value)}
                className="cd-input !w-auto !py-2"
                aria-label="Member to connect"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button
                onClick={() => gcal.connect(targetMember)}
                disabled={!targetMember}
                className="cd-btn cd-btn--accent flex shrink-0 items-center gap-1.5"
              >
                <Plus className="h-4 w-4" /> Connect Google
              </button>
            </div>

            {gcal.loading && <p className="cd-mono-label">loading…</p>}

            {gcal.accounts.map((acct) => {
              const member = members.find((m) => m.id === acct.memberId);
              return (
                <div key={acct.connId} className="flex flex-col gap-3 rounded-btn border border-surface-3 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{acct.email}</p>
                      <p className="cd-mono-label">
                        {member ? member.name : 'unassigned'}{acct.error ? ' · couldn’t sync' : ''}
                      </p>
                    </div>
                    <button onClick={() => gcal.disconnect(acct.connId)} className="text-text-3 hover:text-red-500" aria-label="Disconnect">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm text-text">
                      Show as busy only
                      <span className="block text-xs text-text-2">Hide titles — just show blocked time.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(acct.busyOnly)}
                      onChange={(e) => gcal.setBusyOnly(acct.connId, e.target.checked)}
                      className="h-4 w-4 shrink-0"
                    />
                  </label>

                  {acct.calendars?.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t border-surface-2 pt-2">
                      <p className="cd-mono-label">calendars shown</p>
                      {acct.calendars.map((cal) => (
                        <label key={cal.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={cal.enabled !== false}
                            onChange={(e) => gcal.setCalendarEnabled(acct, cal.id, e.target.checked)}
                            className="h-4 w-4 shrink-0"
                          />
                          {cal.color && <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cal.color }} />}
                          <span className="truncate text-sm text-text">{cal.name || cal.id}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {!gcal.loading && !gcal.accounts.length && (
              <p className="text-sm text-text-2">No Google accounts connected yet — pick a member and connect one above.</p>
            )}
          </>
        )}
      </section>

      {/* Work schedule (CRFTD → ClickUp) */}
      <section className="cd-card flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-text">Work schedule</h2>
          <p className="mt-1 text-sm text-text-2">
            Your CRFTD work blocks (scheduled ClickUp tasks) show on your lane of the family board.
          </p>
        </div>
        {!work.configured ? (
          <p className="rounded-btn border border-surface-3 bg-surface-1 p-3 text-sm text-text-2">
            Not connected yet — add <code className="font-mono text-xs">CRFTD_SUPABASE_URL</code>,{' '}
            <code className="font-mono text-xs">CRFTD_SUPABASE_SERVICE_ROLE_KEY</code> and{' '}
            <code className="font-mono text-xs">CLICKUP_API_TOKEN</code> to enable.
          </p>
        ) : (
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-text">
              Show as busy only
              <span className="block text-xs text-text-2">Hide task titles — just show blocked work time.</span>
            </span>
            <input
              type="checkbox"
              checked={work.busyOnly}
              onChange={(e) => work.setBusyOnly(e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
          </label>
        )}
      </section>

      <button onClick={signOut} className="cd-btn cd-btn--ghost self-start">Sign out</button>
    </div>
  );
}
