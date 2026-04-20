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

  handleReset() {
    this.setState({ hasError: false });
    window.location.href = '/sentinel';
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-sentinel-900 text-white gap-4 p-8">
          <div className="text-fire-500 text-5xl font-bold">!</div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sentinel-400 text-sm max-w-sm text-center">
            An unexpected error occurred. Return to the live map to continue tracking.
          </p>
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
