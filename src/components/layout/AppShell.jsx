import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, HelpCircle, Home, Menu, Settings, Sparkles, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useWhiteboard } from '../../hooks/useWhiteboard';
import { CaptureProvider } from '../../context/CaptureContext';
import MemberSwitcher from '../members/MemberSwitcher';
import Walkthrough from '../Walkthrough';
import WhiteboardPreview from '../fridge/WhiteboardPreview';
import Assistant from '../assistant/Assistant';
import ReminderWatcher from '../ReminderWatcher';
import Screensaver from '../Screensaver';
import SideMenu from './SideMenu';
import QuickActions from './QuickActions';

// Footer tabs that flank the center Quick Actions button.
function FooterLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors md:flex-row md:gap-2 md:px-3 md:text-sm ${isActive ? 'text-text' : 'text-text-3 hover:text-text-2'}`}
    >
      {({ isActive }) => (
        <>
          <Icon className="h-5 w-5" style={isActive ? { color: '#e08a3c' } : undefined} />
          {label}
        </>
      )}
    </NavLink>
  );
}

// Per-page spotlight steps. Pages without their own steps get GENERIC.
const TOURS = {
  '/': [
    { selector: '[data-tour="dash-edit"]', title: 'Make it yours', body: 'Tap Edit to drag, resize, add or remove the cards on this screen. Each device keeps its own layout — set up the kitchen kiosk and your phone differently.' },
    { selector: '[data-tour="whoami"]', title: 'Who are you?', body: 'On the shared screen, tap here to switch which member you are.' },
  ],
  '/tasks': [
    { selector: '[data-tour="task-add"]', title: 'Add a task', body: 'Type a task, assign it to someone, and give it a due date.' },
    { selector: '[data-tour="task-filter"]', title: 'Filter', body: 'Show all tasks, just the open ones, or only yours.' },
    { selector: '[data-tour="task-list"]', title: 'The list', body: 'Check off, reassign, or delete a task. Overdue items turn red.' },
  ],
  '/notes': [
    { selector: '[data-tour="note-add"]', title: 'Note or list', body: 'Jot a note, start a shared checklist, or tap the 📷 to snap a photo of a handwritten list and turn it into an organized checklist automatically.' },
    { selector: '[data-tour="note-grid"]', title: 'Your notes', body: 'Everything the household has jotted. Edit in place; check off list items together.' },
  ],
  '/calendar': [
    { selector: '[data-tour="cal-filter"]', title: 'Who’s showing', body: 'Tap a person to show or hide their items — right in the calendar frame.' },
    { selector: '[data-tour="cal-views"]', title: 'Views', body: 'Switch between List, 1-day, 3-day, Week, and Month. The orange line marks the current time.' },
    { selector: '[data-tour="cal-add-event"]', title: 'Add an event', body: 'Create an event on one of your own calendars — who it’s for, the time, and whether it repeats.' },
    { selector: '[data-tour="cal-grid"]', title: 'The board', body: 'Everyone’s blocks and events, color-coded. Drag a block to move it; tap an event to edit or delete it.' },
  ],
  '/settings': [
    { selector: '[data-tour="set-door"]', title: 'Open the door', body: 'Share your Commons Key so others can join this home and share calendars.' },
    { selector: '[data-tour="set-calendars"]', title: 'Your calendars', body: 'Make in-app calendars for things that don’t belong in a work or email account.' },
    { selector: '[data-tour="set-google"]', title: 'Connect Google', body: 'Add each person’s Google account, then choose busy-only or which calendars appear.' },
  ],
};
const GENERIC = [
  { selector: '[data-tour="nav"]', title: 'Welcome to Commons', body: 'Move between Home, Calendar, Tasks, Notes, and Settings here. Tap the “?” on any page for a quick tour of it.' },
  { selector: '[data-tour="whoami"]', title: 'Who are you?', body: 'On a shared screen, tap here to switch which member you are.' },
];

export default function AppShell() {
  const { household } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [tour, setTour] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);

  const steps = [
    ...(TOURS[pathname] || GENERIC),
    { selector: '[data-tour="ask"]', title: 'Ask Commons', body: 'Your assistant. Tap it and just start talking — ask “anything Thursday?”, say “add milk to the groceries,” or “remind me to leave at 5.” Prefer typing? Tap “Type instead.”' },
  ];

  // Fridge sign-in alert: pop the whiteboard once per app load if it changed.
  const { board } = useWhiteboard(household?.id);
  const [fridgePopup, setFridgePopup] = useState(false);
  const evaluated = useRef(false);
  useEffect(() => {
    if (evaluated.current || !household?.id || !board) return;
    evaluated.current = true;
    const seen = localStorage.getItem(`commons.fridge.seen.${household.id}`);
    if (((board.strokes?.length || 0) + (board.items?.length || 0)) > 0 && board.updated_at && board.updated_at !== seen) setFridgePopup(true);
  }, [household, board]);
  const dismissFridge = () => {
    if (household?.id && board?.updated_at) localStorage.setItem(`commons.fridge.seen.${household.id}`, board.updated_at);
    setFridgePopup(false);
  };

  return (
    <CaptureProvider>
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Top bar — pinned, full width */}
      <header data-tour="topbar" className="relative z-50 flex shrink-0 items-center justify-between gap-3 border-b border-surface-3 bg-surface-0/80 px-4 py-2.5 pt-safe backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:bg-surface-1 hover:text-text"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img src="/icons/icon.svg" alt="" className="h-7 w-auto" />
          <span className="text-sm font-bold text-text">{household?.name || 'Commons'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTour(true)}
            aria-label="Show me around this page"
            title="Show me around this page"
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:bg-surface-1 hover:text-text"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
          <span data-tour="whoami">
            <MemberSwitcher variant="bar" />
          </span>
        </div>
      </header>

      {/* Page content — the only scroll area */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav — Home · Calendar · [Quick actions] · Settings · More */}
      <nav data-tour="nav" className="fixed inset-x-0 bottom-0 z-40 flex shrink-0 items-stretch justify-around border-t border-surface-3 bg-surface-0/95 pb-safe backdrop-blur md:static">
        <FooterLink to="/" label="Home" icon={Home} end />
        <FooterLink to="/calendar" label="Calendar" icon={CalendarDays} />
        <div className="flex flex-1 items-start justify-center">
          <button
            onClick={() => setQaOpen(true)}
            aria-label="Quick actions"
            className="-mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#e08a3c] text-white shadow-lg transition-transform hover:scale-105"
          >
            <Zap className="h-6 w-6" />
          </button>
        </div>
        <FooterLink to="/settings" label="Settings" icon={Settings} />
        <button
          onClick={() => setMenuOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-text-3 transition-colors hover:text-text-2 md:flex-row md:gap-2 md:px-3 md:text-sm"
        >
          <Menu className="h-5 w-5" /> More
        </button>
      </nav>

      {tour && <Walkthrough steps={steps} onClose={() => setTour(false)} />}

      {fridgePopup && pathname !== '/fridge' && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-6" onClick={dismissFridge}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-bold text-text">📌 On the fridge</h3>
            <div className="overflow-hidden rounded-lg border border-surface-3 bg-white">
              <WhiteboardPreview strokes={board.strokes} items={board.items} className="aspect-[5/3] w-full" />
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={dismissFridge} className="cd-btn cd-btn--ghost">Got it</button>
              <button onClick={() => { dismissFridge(); navigate('/fridge'); }} className="cd-btn cd-btn--accent">Open the fridge</button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setAssistantOpen(true)}
        data-tour="ask"
        aria-label="Ask Commons"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-text text-white shadow-lg transition-transform hover:scale-105 md:right-6"
      >
        <Sparkles className="h-6 w-6" />
      </button>
      {assistantOpen && <Assistant voiceFirst onClose={() => setAssistantOpen(false)} />}
      <ReminderWatcher />
      <Screensaver />
      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <QuickActions open={qaOpen} onClose={() => setQaOpen(false)} onAssistant={() => setAssistantOpen(true)} />
    </div>
    </CaptureProvider>
  );
}
