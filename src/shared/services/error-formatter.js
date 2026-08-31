/**
 * error-formatter.js
 * Formats errors into structured JSON for console and server output.
 */

import { ErrorFilter } from './error-filter.js';

/**
 * Collect browser context at time of error.
 * @returns {import('../types/error-logging.js').ErrorContext}
 */
function collectContext() {
  return {
    url: window.location.href,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    pageTitle: document.title,
  };
}

/**
 * Extract error location from stack trace.
 * @param {string} stack - The error stack trace.
 * @returns {{ source: string, line: number, column: number } | null}
 */
function extractLocation(stack) {
  if (!stack) return null;

  // Try to find first meaningful stack frame (skip the error itself)
  const lines = stack.split('\n');
  for (const line of lines) {
    // Chrome/V8 format: at functionName (url:line:col)
    const chromeMatch = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
    if (chromeMatch) {
      return { source: chromeMatch[2], line: Number(chromeMatch[3]), column: Number(chromeMatch[4]) };
    }

    // Firefox format: functionName@url:line:col
    const ffMatch = line.match(/(.+?)@(.+?):(\d+):(\d+)/);
    if (ffMatch) {
      return { source: ffMatch[2], line: Number(ffMatch[3]), column: Number(ffMatch[4]) };
    }

    // Simple URL:line format
    const simpleMatch = line.match(/(https?:\/\/[^\s:]+):(\d+)/);
    if (simpleMatch) {
      return { source: simpleMatch[1], line: Number(simpleMatch[2]), column: 0 };
    }
  }

  return null;
}

/**
 * Format an error into a structured log entry.
 * @param {ErrorType} type - The error type classification.
 * @param {Error|unknown} error - The original error object.
 * @param {import('../types/error-logging.js').ErrorContext} [context] - Additional context.
 * @returns {import('../types/error-logging.js').ErrorLogEntry}
 */
function format(type, error, context) {
  const message = error instanceof Error ? error.message : String(error);
  const stackTrace = error instanceof Error ? error.stack : undefined;
  const location = extractLocation(stackTrace);
  const filtered = ErrorFilter.containsSensitiveData(message + (stackTrace || ''));

  return {
    type,
    message: ErrorFilter.redact(message),
    source: location?.source,
    line: location?.line,
    column: location?.column,
    stackTrace: stackTrace ? ErrorFilter.redact(stackTrace) : undefined,
    timestamp: new Date().toISOString(),
    context: { ...collectContext(), ...context },
    filtered,
  };
}

/**
 * Format for console output (human-readable).
 * @param {import('../types/error-logging.js').ErrorLogEntry} entry
 * @returns {string}
 */
function formatForConsole(entry) {
  const parts = [
    `[${entry.type.toUpperCase()}]`,
    entry.message,
    entry.source ? `at ${entry.source}:${entry.line}:${entry.column}` : '',
  ].filter(Boolean);
  return parts.join(' ');
}

/**
 * Format for server output (JSON).
 * @param {import('../types/error-logging.js').ErrorLogEntry} entry
 * @returns {string}
 */
function formatForServer(entry) {
  return JSON.stringify(entry);
}

export const ErrorFormatter = {
  format,
  formatForConsole,
  formatForServer,
  collectContext,
};
