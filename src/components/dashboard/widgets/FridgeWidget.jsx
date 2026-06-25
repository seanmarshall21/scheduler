import { Link } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useWhiteboard } from '../../../hooks/useWhiteboard';
import WhiteboardPreview from '../../fridge/WhiteboardPreview';

export default function FridgeWidget() {
  const { household } = useApp();
  const { strokes, items } = useWhiteboard(household?.id);
  const has = strokes.length || items.length;
  return (
    <Link to="/fridge" className="flex h-full flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="cd-mono-label">the fridge</span>
        <PenLine className="h-4 w-4 text-text-3" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-surface-3 bg-white">
        {has ? (
          <WhiteboardPreview strokes={strokes} items={items} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center"><span className="cd-mono-label">tap to leave a note</span></div>
        )}
      </div>
    </Link>
  );
}
