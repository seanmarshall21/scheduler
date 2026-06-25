import { Component } from 'react';

// App-wide safety net. Without this, any thrown render/effect error unmounts the
// whole tree and leaves a blank screen. Now we show the error + a way back.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Commons] crashed:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-bold text-text">Something hiccupped</h1>
        <p className="max-w-sm text-sm text-text-2">Commons hit an error. You can reload — your data is safe.</p>
        <pre className="max-w-full overflow-auto rounded-btn border border-surface-3 bg-surface-1 p-3 text-left text-xs text-text-3">
          {String(error?.message || error)}
        </pre>
        <div className="flex gap-2">
          <button onClick={() => this.setState({ error: null })} className="cd-btn cd-btn--secondary">Try again</button>
          <button onClick={() => window.location.reload()} className="cd-btn cd-btn--accent">Reload</button>
        </div>
      </div>
    );
  }
}
