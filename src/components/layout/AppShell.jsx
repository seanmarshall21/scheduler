import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarDays, CheckSquare, HelpCircle, Home, Settings, StickyNote } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import MemberSwitcher from '../members/MemberSwitcher';
import Walkthrough from '../Walkthrough';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Per-page spotlight steps. Pages without their own steps get GENERIC.
const TOURS = {
  '/': [
    { selector: '[data-tour="home-clock"]', title: 'Today at a glance', body: 'The big clock and date — built to read across the kitchen. Everyone in the home shows up here.' },
    { selector: '[data-tour="home-agenda"]', title: 'Today’s agenda', body: 'Everything scheduled today, color-coded per person. Tap “open calendar” for the full board.' },
    { selector: '[data-tour="home-tasks"]', title: 'What’s due', body: 'Tasks due today (or what’s open). Tap “all” to manage them.' },
    { selector: '[data-tour="whoami"]', title: 'Who are you?', body: 'On the shared screen, tap here to switch which family member you are.' },
  ],
  '/tasks': [
    { selector: '[data-tour="task-add"]', title: 'Add a task', body: 'Type a task, assign it to someone, and give it a due date.' },
    { selector: '[data-tour="task-filter"]', title: 'Filter', body: 'Show all tasks, just the open ones, or only yours.' },
    { selector: '[data-tour="task-list"]', title: 'The list', body: 'Check off, reassign, or delete a task. Overdue items turn red.' },
  ],
  '/notes': [
    { selector: '[data-tour="note-add"]', title: 'Note or list', body: 'Jot a quick note, or start a shared checklist (like groceries) anyone can add to.' },
    { selector: '[data-tour="note-grid"]', title: 'Your notes', body: 'Everything the household has jotted. Edit in place; check off list items together.' },
  ],
  '/calendar': [
    { selector: '[data-tour="cal-filter"]', title: 'Filter by person', body: 'Tap a person to show or hide their items on the board.' },
    { selector: '[data-tour="cal-add-event"]', title: 'Add an event', body: 'Create an event on one of your own calendars — choose who it’s for, the time, and whether it repeats.' },
    { selector: '[data-tour="cal-grid"]', title: 'The board', body: 'Everyone’s blocks and events, color-coded. Drag a block to move it; tap an event to edit or delete it.' },
  ],
  '/settings': [
    { selector: '[data-tour="set-door"]', title: 'Open the door', body: 'Share your Commons Key so family can join this home and share calendars.' },
    { selector: '[data-tour="set-calendars"]', title: 'Your calendars', body: 'Make in-app calendars for things that don’t belong in a work or email account.' },
    { selector: '[data-tour="set-google"]', title: 'Connect Google', body: 'Add each person’s Google account, then choose busy-only or which calendars appear.' },
  ],
};
const GENERIC = [
  { selector: '[data-tour="nav"]', title: 'Welcome to Commons', body: 'Move between Home, Calendar, Tasks, Notes, and Settings here. Tap the “?” on any page for a quick tour of it.' },
  { selector: '[data-tour="whoami"]', title: 'Who are you?', body: 'On a shared screen, tap here to switch which family member you are.' },
];

export default function AppShell() {
  const { household } = useApp();
  const { pathname } = useLocation();
  const [tour, setTour] = useState(false);

  const steps = TOURS[pathname] || GENERIC;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar */}
      <header data-tour="topbar" className="flex items-center justify-between gap-3 border-b border-surface-3 bg-surface-0/80 px-4 py-2.5 pt-safe backdrop-blur">
        <div className="flex items-center gap-2">
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

      {/* Page content */}
      <main className="flex min-h-0 flex-1 flex-col pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav (phones + touch); becomes a top-row tab bar on wide kiosks via CSS */}
      <nav data-tour="nav" className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-surface-3 bg-surface-0/95 pb-safe backdrop-blur md:static md:justify-start md:gap-1 md:border-b md:border-t-0 md:px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => {
          const active = end ? pathname === to : pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors md:flex-none md:flex-row md:gap-2 md:px-3 md:text-sm ${
                active ? 'text-text' : 'text-text-3 hover:text-text-2'
              }`}
            >
              <Icon className="h-5 w-5" style={active ? { color: '#e08a3c' } : undefined} />
              {label}
            </NavLink>
          );
        })}
      </nav>

      {tour && <Walkthrough steps={steps} onClose={() => setTour(false)} />}
    </div>
  );
}
