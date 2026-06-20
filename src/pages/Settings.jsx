import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useMembers } from '../hooks/useMembers';
import MemberChip from '../components/members/MemberChip';

const PALETTE = ['#e0603c', '#3c8fe0', '#3ca06a', '#9b5de5', '#e0a83c', '#e05c9e', '#3ca6a0', '#7a6f5f'];

export default function Settings() {
  const { household } = useApp();
  const { signOut } = useAuth();
  const { members, addMember, updateMember, deactivateMember } = useMembers();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);

  const add = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addMember({ name: newName.trim(), color: newColor });
    setNewName('');
    setNewColor(PALETTE[(members.length + 1) % PALETTE.length]);
  };

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

      {/* Google Calendar — wiring lands in the next pass */}
      <section className="cd-card">
        <h2 className="text-base font-bold text-text">Google Calendar</h2>
        <p className="mt-1 text-sm text-text-2">
          Connect each member's Google account so their events show on the board. (Multi-account OAuth is
          ported from CRFTD and wired up next.)
        </p>
        <button disabled className="cd-btn cd-btn--secondary mt-3">Connect Google — coming next</button>
      </section>

      <button onClick={signOut} className="cd-btn cd-btn--ghost self-start">Sign out</button>
    </div>
  );
}
