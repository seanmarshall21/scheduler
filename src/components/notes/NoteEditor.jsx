import { useRef, useState } from 'react';
import { Bold, CheckSquare, Heading1, Heading2, Italic, List, ListOrdered, Quote } from 'lucide-react';

// A markdown note editor with a ClickUp-style formatting toolbar. Buttons wrap
// the selection or prefix the selected lines with markdown.
export default function NoteEditor({ value, onSave, onCancel }) {
  const [text, setText] = useState(value || '');
  const ref = useRef(null);

  const apply = (fn) => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const { text: nt, sel } = fn(text, s, e);
    setText(nt);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(sel[0], sel[1]); });
  };
  const wrap = (b, a = b) => apply((t, s, e) => ({
    text: t.slice(0, s) + b + t.slice(s, e) + a + t.slice(e),
    sel: [s + b.length, e + b.length],
  }));
  const prefixLines = (p) => apply((t, s, e) => {
    const start = t.lastIndexOf('\n', s - 1) + 1;
    const seg = t.slice(start, e) || '';
    const replaced = (seg || '').split('\n').map((l) => p + l).join('\n');
    return { text: t.slice(0, start) + replaced + t.slice(e), sel: [start, start + replaced.length] };
  });

  const tools = [
    { Icon: Heading1, title: 'Heading', fn: () => prefixLines('# ') },
    { Icon: Heading2, title: 'Subheading', fn: () => prefixLines('## ') },
    { Icon: Bold, title: 'Bold', fn: () => wrap('**') },
    { Icon: Italic, title: 'Italic', fn: () => wrap('*') },
    { Icon: List, title: 'Bullet list', fn: () => prefixLines('- ') },
    { Icon: ListOrdered, title: 'Numbered list', fn: () => prefixLines('1. ') },
    { Icon: CheckSquare, title: 'Checklist', fn: () => prefixLines('- [ ] ') },
    { Icon: Quote, title: 'Quote', fn: () => prefixLines('> ') },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1 rounded-btn border border-surface-3 bg-surface-1 p-1">
        {tools.map(({ Icon, title, fn }) => (
          <button
            key={title}
            title={title}
            onMouseDown={(e) => { e.preventDefault(); fn(); }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-2 hover:bg-surface-2 hover:text-text"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        autoFocus
        placeholder="Write… select text and tap a format button"
        className="cd-input resize-y font-sans text-sm leading-relaxed"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="cd-btn cd-btn--ghost text-sm">Cancel</button>
        <button onClick={() => onSave(text)} className="cd-btn cd-btn--accent text-sm">Done</button>
      </div>
    </div>
  );
}
