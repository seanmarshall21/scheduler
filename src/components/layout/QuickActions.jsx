import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Camera, CheckSquare, ListChecks, Sparkles, X, Zap } from 'lucide-react';
import { useCapture } from '../../context/CaptureContext';

// Center-footer "Quick actions" drawer.
export default function QuickActions({ open, onClose, onAssistant }) {
  const navigate = useNavigate();
  const { openCapture } = useCapture();
  if (!open) return null;

  const run = (fn) => { onClose(); fn(); };
  const actions = [
    { icon: Camera, title: 'Capture', sub: 'Photo or screenshot → event, list, task or note', onClick: () => run(openCapture) },
    { icon: Sparkles, title: 'Ask Commons', sub: 'Talk or type to your assistant', onClick: () => run(onAssistant) },
    { icon: CalendarPlus, title: 'New event', sub: 'Add to the calendar', onClick: () => run(() => navigate('/calendar')) },
    { icon: CheckSquare, title: 'New task', sub: 'Add a shared to-do', onClick: () => run(() => navigate('/tasks')) },
    { icon: ListChecks, title: 'New list or note', sub: 'Jot or start a checklist', onClick: () => run(() => navigate('/notes')) },
  ];

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl border border-surface-3 bg-bg p-3 pb-safe shadow-xl sm:mb-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-2 text-base font-bold text-text"><Zap className="h-4 w-4" style={{ color: '#e08a3c' }} /> Quick actions</h3>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:bg-surface-1"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col gap-1.5">
          {actions.map((a) => (
            <button key={a.title} onClick={a.onClick} className="flex items-center gap-3 rounded-btn border border-surface-3 p-3 text-left transition-colors hover:bg-surface-1">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-1"><a.icon className="h-5 w-5 text-text" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-text">{a.title}</span>
                <span className="block truncate text-xs text-text-2">{a.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
