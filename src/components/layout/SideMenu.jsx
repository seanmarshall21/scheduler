import { NavLink } from 'react-router-dom';
import { CalendarDays, CheckSquare, Home, PenLine, Settings, StickyNote, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/notes', label: 'Notes & Lists', icon: StickyNote },
  { to: '/fridge', label: 'The fridge', icon: PenLine },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Full-nav slide-out (from the hamburger or the footer "More").
export default function SideMenu({ open, onClose }) {
  const { household } = useApp();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[140]">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-bg pt-safe shadow-xl">
        <div className="flex items-center justify-between border-b border-surface-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/icons/icon.svg" alt="" className="h-7 w-auto" />
            <span className="text-sm font-bold text-text">{household?.name || 'Commons'}</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:bg-surface-1"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 overflow-auto p-2">
          {ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) => `flex items-center gap-3 rounded-btn px-3 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-surface-1 text-text' : 'text-text-2 hover:bg-surface-1'}`}
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-5 w-5" style={isActive ? { color: '#e08a3c' } : undefined} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
