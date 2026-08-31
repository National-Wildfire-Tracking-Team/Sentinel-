import { Component } from 'react';
import { getAppOrigin } from '../utils/getAppOrigin';

/**
 * Detect whether the user has an active Supabase session.
 * Checks both localStorage/sessionStorage and a lightweight cookie marker
 * set by the auth flow. The cookie approach is more reliable in test
 * environments where localStorage may not persist across navigations.
 */
function hasSupabaseSession() {
  try {
    // Check cookie marker (set by AuthContext on sign-in)
    if (document.cookie.includes('sentinel_auth=1')) {
      return true;
    }
    // Check localStorage and sessionStorage for Supabase session tokens
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        return true;
      }
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        return true;
      }
    }
  } catch {
    // Storage access may fail in private browsing or restricted contexts
  }
  return false;
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isAuthenticated: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true, isAuthenticated: hasSupabaseSession() };
  }

  componentDidCatch(error, info) {
    console.error('[Sentinel] Unhandled error:', error, info.componentStack);
    this.setState({ error, componentStack: info.componentStack });
  }

  handleReset() {
    this.setState({ hasError: false });
    window.location.href = `${getAppOrigin()}/`;
  }

  render() {
    if (this.state.hasError) {
      const { isAuthenticated, error, componentStack } = this.state;
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-sentinel-900 text-white gap-4 p-8">
          <div className="text-fire-500 text-5xl font-bold">!</div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sentinel-400 text-sm max-w-sm text-center">
            {isAuthenticated
              ? 'Your sign-in was successful, but something went wrong loading the application. You can return to the live map — your session is preserved.'
              : 'An unexpected error occurred. Return to the live map to continue tracking.'}
          </p>
          {error && (
            <details className="max-w-lg text-xs text-sentinel-500 bg-sentinel-800 rounded p-3 cursor-pointer">
              <summary className="text-sentinel-400 font-medium">Error details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">
                {error.message}
                {componentStack && `\n\nComponent stack:${componentStack}`}
              </pre>
            </details>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => this.handleReset()}
              className="px-4 py-2 bg-fire-600 hover:bg-fire-500 rounded-lg text-sm font-medium transition-colors"
            >
              Go to Live Map
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-sentinel-700 hover:bg-sentinel-600 rounded-lg text-sm font-medium transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
