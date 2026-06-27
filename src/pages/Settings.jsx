import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useMembers } from '../hooks/useMembers';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { useWorkSchedule } from '../hooks/useWorkSchedule';
import { useCalendars } from '../hooks/useCalendars';
import { onVoicesReady, speak, usableVoices, ttsStatus, getVoiceSel, setVoiceSel } from '../lib/speech';
import { getVoicePrefs, setVoicePref, START_OPTIONS, PAUSE_OPTIONS, BARGE_OPTIONS, keyLabel } from '../lib/voicePrefs';
import { downscaleImage } from '../lib/image';
import { useReminders } from '../hooks/useReminders';
import { REMINDER_SPEAK_KEY } from '../components/ReminderWatcher';
import { pushSupported, pushConfigured, pushStatus, enablePush, disablePush } from '../lib/push';
import MemberChip from '../components/members/MemberChip';

const PALETTE = ['#e0603c', '#3c8fe0', '#3ca06a', '#9b5de5', '#e0a83c', '#e05c9e', '#3ca6a0', '#7a6f5f'];

export default function Settings() {
  const { household, activeMemberId } = useApp();
  const { signOut } = useAuth();
  const { members, addMember, updateMember, deactivateMember } = useMembers();
  const [avatarTarget, setAvatarTarget] = useState(null);
  const avatarInput = useRef(null);
  const pickAvatar = (id) => { setAvatarTarget(id); setTimeout(() => avatarInput.current?.click(), 0); };
  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !avatarTarget) return;
    try { await updateMember(avatarTarget, { avatar_url: await downscaleImage(file, 256, 0.82) }); } catch { /* ignore */ }
    setAvatarTarget(null);
  };
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);

  const gcal = useGoogleCalendar();
  const work = useWorkSchedule();
  const cal = useCalendars(household?.id);
  const rem = useReminders(household?.id);
  const notifSupported = typeof Notification !== 'undefined';
  const [notifPerm, setNotifPerm] = useState(notifSupported ? Notification.permission : 'denied');
  const requestNotif = async () => { try { setNotifPerm(await Notification.requestPermission()); } catch { /* ignore */ } };
  const [speakRem, setSpeakRem] = useState(() => typeof localStorage === 'undefined' || localStorage.getItem(REMINDER_SPEAK_KEY) !== '0');
  const toggleSpeakRem = (on) => { setSpeakRem(on); localStorage.setItem(REMINDER_SPEAK_KEY, on ? '1' : '0'); };
  const [push, setPush] = useState('off');
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => { pushStatus().then(setPush); }, []);
  const togglePush = async () => {
    setPushBusy(true);
    try {
      setPush(push === 'on' ? await disablePush() : await enablePush(household?.id));
      if (push !== 'on') setNotifPerm('granted');
    } catch (e) { window.alert(e.message); }
    setPushBusy(false);
  };
  const [newCalName, setNewCalName] = useState('');
  const [voices, setVoices] = useState([]);
  const [tts, setTts] = useState(null);
  const [voiceSel, setVoiceSelState] = useState(getVoiceSel());
  const [vp, setVp] = useState(getVoicePrefs());
  const [capturing, setCapturing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const updVp = (name, value) => { setVoicePref(name, value); setVp((p) => ({ ...p, [name]: value })); };
  const micAvailable = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const [connectMemberId, setConnectMemberId] = useState(activeMemberId || '');
  const [expandedConn, setExpandedConn] = useState(null);
  const [copied, setCopied] = useState(false);

  const copyInvite = () => {
    if (!household?.join_code) return;
    navigator.clipboard?.writeText(`${window.location.origin}/join?key=${household.join_code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Finish the OAuth handshake when Google redirects back to /settings.
  useEffect(() => {
    const code = searchParams.get('code');
    if (code && searchParams.get('state') === 'gcal') {
      gcal.exchangeCode(code).finally(() => setSearchParams({}, { replace: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    onVoicesReady(setVoices);
    ttsStatus().then(setTts);
    // Refresh when account-synced prefs arrive from another device.
    const onSynced = () => { setVp(getVoicePrefs()); setVoiceSelState(getVoiceSel()); };
    window.addEventListener('commons:prefs-synced', onSynced);
    return () => window.removeEventListener('commons:prefs-synced', onSynced);
  }, []);

  useEffect(() => {
    if (!capturing) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      updVp('pttKey', e.code);
      updVp('pttKeyLabel', keyLabel(e));
      setCapturing(false);
    };
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [capturing]);

  const add = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addMember({ name: newName.trim(), color: newColor });
    setNewName('');
    setNewColor(PALETTE[(members.length + 1) % PALETTE.length]);
  };

  const addCal = (e) => {
    e.preventDefault();
    if (!newCalName.trim()) return;
    cal.addCalendar({ name: newCalName.trim(), color: PALETTE[cal.calendars.length % PALETTE.length] });
    setNewCalName('');
  };

  const targetMember = connectMemberId || members[0]?.id || '';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-3 md:p-4">
      <section className="cd-card">
        <h2 className="mb-1 text-base font-bold text-text">{household?.name}</h2>
        <p className="cd-mono-label">household</p>
      </section>

      {/* Open the door — invite to this household */}
      {household?.join_code && (
        <section data-tour="set-door" className="cd-card flex flex-col gap-3">
          <div>
            <h2 className="text-base font-bold text-text">Open the door</h2>
            <p className="mt-1 text-sm text-text-2">
              Share your Commons Key so others can join this home and share calendars.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="cd-mono-label">Commons Key</span>
            <code className="rounded-btn border border-surface-3 bg-surface-1 px-2 py-1 font-mono text-sm tracking-widest text-text">
              {household.join_code}
            </code>
          </div>
          <button onClick={copyInvite} className="cd-btn cd-btn--secondary flex items-center gap-1.5 self-start">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Invite link copied' : 'Copy invite link'}
          </button>
        </section>
      )}

      {/* Members */}
      <section className="cd-card flex flex-col gap-3">
        <h2 className="text-base font-bold text-text">Members</h2>
        <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-btn border border-surface-3 p-2">
              <span className="relative shrink-0 cursor-pointer" onClick={() => pickAvatar(m.id)} title="Change photo">
                <MemberChip member={m} size={36} />
                {m.avatar_url && (
                  <span
                    onClick={(e) => { e.stopPropagation(); updateMember(m.id, { avatar_url: null }); }}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-text text-[10px] leading-none text-white"
                    title="Remove photo"
                  >×</span>
                )}
              </span>
              <input
                defaultValue={m.name}
                onBlur={(e) => e.target.value !== m.name && updateMember(m.id, { name: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-text focus:outline-none"
              />
              <div className="flex min-w-0 flex-wrap justify-end gap-1">
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

      {/* Your calendars (app-native) */}
      <section data-tour="set-calendars" className="cd-card flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-text">Your calendars</h2>
          <p className="mt-1 text-sm text-text-2">
            In-app calendars for things that don't live in a work or email account. Add events to them on the Calendar tab.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {cal.calendars.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-btn border border-surface-3 p-2">
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <input
                defaultValue={c.name}
                onBlur={(e) => e.target.value !== c.name && cal.updateCalendar(c.id, { name: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-text focus:outline-none"
              />
              <div className="flex min-w-0 flex-wrap justify-end gap-1">
                {PALETTE.slice(0, 6).map((col) => (
                  <button key={col} onClick={() => cal.updateCalendar(c.id, { color: col })}
                    className={`h-5 w-5 rounded-full ${c.color === col ? 'ring-2 ring-offset-1' : ''}`} style={{ backgroundColor: col }} aria-label={`color ${col}`} />
                ))}
              </div>
              <label className="flex shrink-0 items-center gap-1 text-xs text-text-2">
                <input type="checkbox" checked={c.is_visible !== false}
                  onChange={(e) => cal.updateCalendar(c.id, { is_visible: e.target.checked })} className="h-4 w-4" />
                shown
              </label>
              <button onClick={() => cal.removeCalendar(c.id)} className="text-text-3 hover:text-red-500" aria-label="Delete calendar">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!cal.calendars.length && <p className="text-sm text-text-2">No calendars yet — add one below or from "+ Event".</p>}
        </div>
        <form onSubmit={addCal} className="flex items-center gap-2 border-t border-surface-2 pt-3">
          <input value={newCalName} onChange={(e) => setNewCalName(e.target.value)} placeholder="New calendar (e.g. Kids, Family)…" className="cd-input flex-1 !py-2" />
          <button type="submit" className="cd-btn cd-btn--accent shrink-0"><Plus className="h-4 w-4" /></button>
        </form>
      </section>

      {/* Google Calendar */}
      <section data-tour="set-google" className="cd-card flex flex-col gap-3">
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
              const open = expandedConn === acct.connId;
              return (
                <div key={acct.connId} className="rounded-btn border border-surface-3">
                  {/* Collapsed header — tap to expand */}
                  <button
                    type="button"
                    onClick={() => setExpandedConn(open ? null : acct.connId)}
                    className="flex w-full items-center justify-between gap-2 p-3 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {member && <MemberChip member={member} size={24} />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text">{acct.email}</span>
                        <span className="cd-mono-label">
                          {member ? member.name : 'unassigned'}
                          {acct.busyOnly ? ' · busy only' : ''}
                          {acct.error ? ' · couldn’t sync' : ''}
                        </span>
                      </span>
                    </span>
                    {open
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-text-3" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-text-3" />}
                  </button>

                  {open && (
                    <div className="flex flex-col gap-3 border-t border-surface-2 p-3">
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

                      <button
                        onClick={() => gcal.disconnect(acct.connId)}
                        className="flex items-center gap-1.5 self-start text-xs font-medium text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Disconnect
                      </button>
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
            Your CRFTD work blocks (scheduled ClickUp tasks) show on your lane of the shared board.
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

      {/* Assistant voice */}
      <section className="cd-card flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-text">Assistant voice</h2>
          <p className="mt-1 text-sm text-text-2">The voice Commons uses when it reads replies aloud.</p>
        </div>

        {(tts?.configured || voices.length) ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={voiceSel}
                onChange={(e) => { setVoiceSelState(e.target.value); setVoiceSel(e.target.value); }}
                className="cd-input min-w-0 flex-1 !py-2"
              >
                <option value="">Auto (best available)</option>
                {tts?.configured && Object.entries(
                  (tts.voices || []).reduce((acc, v) => { (acc[v.group] ||= []).push(v); return acc; }, {}),
                ).map(([group, list]) => (
                  <optgroup key={group} label={`${group} · Google Cloud`}>
                    {list.map((v) => (<option key={v.id} value={`cloud:${v.id}`}>{v.label}</option>))}
                  </optgroup>
                ))}
                {voices.length > 0 && (
                  <optgroup label="Browser voices (this device)">
                    {usableVoices(voices).map((v) => (<option key={v.name} value={`browser:${v.name}`}>{v.name}</option>))}
                  </optgroup>
                )}
              </select>
              <button onClick={() => speak('Hi, I’m Commons. This is how I sound.')} className="cd-btn cd-btn--secondary shrink-0">Test</button>
            </div>
            <p className="text-xs text-text-3">
              {tts?.configured
                ? 'Google Cloud voices are the most lifelike; browser voices work offline. Tap Test after picking one.'
                : "These are your device's built-in voices."}
            </p>
          </>
        ) : (
          <p className="text-sm text-text-2">No speech voices available on this device.</p>
        )}
      </section>

      {/* Voice input */}
      {micAvailable && (
        <section className="cd-card flex flex-col gap-3">
          <div>
            <h2 className="text-base font-bold text-text">Voice input</h2>
            <p className="mt-1 text-sm text-text-2">What happens when you open the assistant.</p>
          </div>
          <div className="flex gap-2">
            {START_OPTIONS.map((o) => (
              <button
                key={o.val}
                onClick={() => updVp('startMode', o.val)}
                title={o.hint}
                className={`flex-1 rounded-btn border px-2 py-2 text-sm transition-colors ${vp.startMode === o.val ? 'border-[#e08a3c] bg-surface-1 font-semibold text-text' : 'border-surface-3 text-text-2 hover:bg-surface-1'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {vp.startMode === 'listen' && (
            <>
              <label className="flex items-center justify-between gap-3 text-sm text-text">
                <span className="min-w-0 flex-1">
                  Pause before replying
                  <span className="block text-xs text-text-2">How long to wait after you stop talking.</span>
                </span>
                <select value={vp.pauseMs} onChange={(e) => updVp('pauseMs', Number(e.target.value))} className="cd-input !w-auto shrink-0 !py-2">
                  {PAUSE_OPTIONS.map((o) => (<option key={o.ms} value={o.ms}>{o.label}</option>))}
                </select>
              </label>
              <div>
                <p className="text-sm text-text">
                  Interrupt while it’s talking
                  <span className="block text-xs text-text-2">Talk over a reply to cut it off. Turn down if it stops itself too easily.</span>
                </p>
                <div className="mt-2 flex gap-2">
                  {BARGE_OPTIONS.map((o) => (
                    <button
                      key={o.val}
                      onClick={() => updVp('bargeIn', o.val)}
                      title={o.hint}
                      className={`flex-1 rounded-btn border px-2 py-1.5 text-sm transition-colors ${vp.bargeIn === o.val ? 'border-[#e08a3c] bg-surface-1 font-semibold text-text' : 'border-surface-3 text-text-2 hover:bg-surface-1'}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* PTT key — works in Listening (interrupt + talk over) and Push-to-talk (talk) */}
          <div className="flex items-center justify-between gap-3 text-sm text-text">
            <span className="min-w-0 flex-1">
              Push-to-talk key
              <span className="block text-xs text-text-2">Hold this key (or the mic) to talk; tap to interrupt a reply. Works in Listening too.</span>
            </span>
            <button onClick={() => setCapturing(true)} className="cd-btn cd-btn--secondary min-w-[110px] shrink-0">
              {capturing ? 'Press a key…' : vp.pttKeyLabel}
            </button>
          </div>

          {vp.startMode === 'text' && (
            <p className="text-xs text-text-3">The assistant opens to the keyboard; tap the mic anytime to switch to voice.</p>
          )}
        </section>
      )}

      {/* Reminders */}
      <section className="cd-card flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-text">Reminders</h2>
          <p className="mt-1 text-sm text-text-2">Ask the assistant to “remind me…”. They alert here (and aloud) while Commons is open.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {pushSupported() && pushConfigured() ? (
            <button onClick={togglePush} disabled={pushBusy} className="cd-btn cd-btn--secondary text-sm disabled:opacity-60">
              {push === 'on' ? '✓ Background reminders on' : 'Enable background reminders'}
            </button>
          ) : notifSupported ? (
            <button onClick={requestNotif} disabled={notifPerm === 'granted'} className="cd-btn cd-btn--secondary text-sm disabled:opacity-60">
              {notifPerm === 'granted' ? '✓ Notifications on' : 'Enable notifications'}
            </button>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={speakRem} onChange={(e) => toggleSpeakRem(e.target.checked)} className="h-4 w-4" />
            Speak reminders aloud
          </label>
        </div>
        <p className="text-xs text-text-3">“Background reminders” delivers a push even when Commons is fully closed (allow notifications when asked). This device included.</p>
        {rem.reminders.filter((r) => !r.fired).length ? (
          <div className="flex flex-col gap-1.5">
            {rem.reminders.filter((r) => !r.fired).map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-btn border border-surface-3 p-2">
                <span className="w-28 shrink-0 font-mono text-[10px] text-text-2">
                  {new Date(r.remind_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text">{r.text}</span>
                <button onClick={() => rem.removeReminder(r.id)} aria-label="Delete reminder" className="text-text-3 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-2">No upcoming reminders.</p>
        )}
      </section>

      <button onClick={signOut} className="cd-btn cd-btn--ghost self-start">Sign out</button>
    </div>
  );
}
