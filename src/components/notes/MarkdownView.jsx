import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Read-only rich render of a note's markdown body (headings, bold/italic, lists,
// checkboxes, quotes, code, links).
const components = {
  h1: (p) => <h1 className="mb-1 mt-3 text-lg font-bold text-text first:mt-0" {...p} />,
  h2: (p) => <h2 className="mb-1 mt-3 text-base font-bold text-text first:mt-0" {...p} />,
  h3: (p) => <h3 className="mb-0.5 mt-2 text-sm font-bold text-text first:mt-0" {...p} />,
  p: (p) => <p className="my-1 text-sm leading-relaxed text-text" {...p} />,
  ul: (p) => <ul className="my-1 list-disc pl-5 text-sm text-text" {...p} />,
  ol: (p) => <ol className="my-1 list-decimal pl-5 text-sm text-text" {...p} />,
  li: ({ className, children, ...p }) => (
    <li className={`my-0.5 ${className?.includes('task-list-item') ? 'list-none -ml-4' : ''}`} {...p}>{children}</li>
  ),
  a: (p) => <a className="text-forest-700 underline" target="_blank" rel="noreferrer" {...p} />,
  strong: (p) => <strong className="font-bold text-text" {...p} />,
  em: (p) => <em className="italic" {...p} />,
  blockquote: (p) => <blockquote className="my-1 border-l-2 border-surface-3 pl-3 text-sm italic text-text-2" {...p} />,
  code: (p) => <code className="rounded bg-surface-1 px-1 py-0.5 font-mono text-xs" {...p} />,
  input: ({ ...p }) => <input {...p} disabled className="mr-1.5 h-3.5 w-3.5 translate-y-[1px]" />,
  hr: () => <hr className="my-2 border-surface-3" />,
};

export default function MarkdownView({ children }) {
  return (
    <div className="break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children || ''}</ReactMarkdown>
    </div>
  );
}
