import { Link } from 'react-router-dom';
import { StickyNote } from 'lucide-react';

export default function NotesWidget() {
  return (
    <Link to="/notes" className="flex h-full items-center gap-3">
      <StickyNote className="h-5 w-5 text-text-2" />
      <span className="text-sm font-bold text-text">Household notes &amp; lists</span>
    </Link>
  );
}
