/**
 * ErrorBoundary.jsx
 * Catches unhandled render errors and shows a recovery screen
 * instead of a blank page.
 */

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[Sentinel] Unhandled error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-sentinel-900 text-white gap-4 p-8">
          <div className="text-fire-500 text-5xl font-bold">!</div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sentinel-400 text-sm max-w-sm text-center">
            An unexpected error occurred. Please reload the page to continue tracking.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-fire-600 hover:bg-fire-500 rounded-lg text-sm font-medium transition-colors"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
