import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component } from 'react';

/**
 * Catches render errors in a page so one broken screen shows a recoverable
 * message instead of unmounting the whole app (the "white screen").
 * Reset it by changing its `key` (e.g. the current pathname).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto my-12 max-w-lg animate-fade-in rounded-xl border border-red-200 bg-white p-8 text-center shadow-card" role="alert">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">This page ran into a problem</h2>
        <p className="mt-1 text-sm text-slate-600">The rest of the system still works. Try again, or go back to the previous page.</p>
        <p className="mt-3 break-words rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">{String(this.state.error?.message || this.state.error)}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-2 rounded-md bg-brand-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-900"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </button>
          <button type="button" onClick={() => window.history.back()} className="rounded-md px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50">
            Go back
          </button>
        </div>
      </div>
    );
  }
}
