import { AlertCircle, AlertTriangle, RefreshCw, X, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

export default function AlertErrorBanner({
  error,
  detail,
  onDismiss,
  onRetry,
  staleCount,
}) {
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setRetrying(false);
  }, [error, detail]);

  const handleRetry = useCallback(() => {
    if (onRetry) {
      setRetrying(true);
      onRetry();
    }
  }, [onRetry]);

  if (!error || dismissed) return null;

  const isFull = error === 'full';
  const Icon = isFull ? AlertCircle : AlertTriangle;
  const bg = isFull
    ? 'bg-red-950/60 border-red-700/60 text-red-200'
    : 'bg-yellow-950/50 border-yellow-700/50 text-yellow-200';
  const iconColor = isFull ? 'text-red-400' : 'text-yellow-400';

  const message = isFull
    ? 'Alert data unavailable'
    : 'Alert data may be incomplete';

  const subtitle = isFull && staleCount > 0
    ? `Showing last known alerts (${staleCount})`
    : detail || '';

  return (
    <div className={`mx-2.5 mb-2.5 px-3.5 py-3 rounded-xl border ${bg} flex items-start gap-3`}>
      <Icon size={17} className={`shrink-0 mt-0.5 ${iconColor}`} strokeWidth={2.5} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">{message}</p>
        {subtitle && (
          <p className="text-xs mt-1 opacity-80">{subtitle}</p>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors text-xs font-semibold"
          >
            {retrying ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={() => { setDismissed(true); onDismiss?.(); }}
          className="shrink-0 p-1 rounded-md hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
