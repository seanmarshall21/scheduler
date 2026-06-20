import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarDays, CheckSquare, Home, Settings, StickyNote } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import MemberSwitcher from '../members/MemberSwitcher';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AppShell() {
  const { household } = useApp();
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-surface-3 bg-surface-0/80 px-4 py-2.5 pt-safe backdrop-blur">
        <div className="flex items-center gap-2">
          <img src="/icons/icon.svg" alt="" className="h-7 w-7" />
          <span className="text-sm font-bold text-text">{household?.name || 'Hearth'}</span>
        </div>
        <MemberSwitcher variant="bar" />
      </header>

      {/* Page content */}
      <main className="flex min-h-0 flex-1 flex-col pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav (phones + touch); becomes a top-row tab bar on wide kiosks via CSS */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-surface-3 bg-surface-0/95 pb-safe backdrop-blur md:static md:justify-start md:gap-1 md:border-b md:border-t-0 md:px-3">
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
    </div>
  );
}
