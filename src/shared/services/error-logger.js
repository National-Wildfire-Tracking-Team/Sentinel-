/**
 * error-logger.js
 * Core error capture and logging service.
 * Captures unhandled errors, promise rejections, console errors, and network failures.
 */

import { ErrorType } from '../types/error-logging.js';
import { ErrorFormatter } from './error-formatter.js';

/** @type {import('../types/error-logging.js').ErrorLogEntry[]} */
let errors = [];

/** @type {boolean} */
let initialized = false;

/** @type {((...args: any[]) => void) | null} */
let originalConsoleError = null;

/**
 * Output an error entry to both browser console and server stdout.
 * @param {import('../types/error-logging.js').ErrorLogEntry} entry
 */
function outputEntry(entry) {
  console.error(ErrorFormatter.formatForConsole(entry));
  console.error(ErrorFormatter.formatForServer(entry));
}

/**
 * Handle global uncaught errors.
 * @param {string} message
 * @param {string} source
 * @param {number} line
 * @param {number} col
 * @param {Error} error
 */
function handleError(message, source, line, col, error) {
  const entry = ErrorFormatter.format(
    ErrorType.ERROR,
    error || new Error(message),
    { componentHierarchy: [] }
  );

  if (source) entry.source = source;
  if (line) entry.line = line;
  if (col) entry.column = col;

  errors.push(entry);
  outputEntry(entry);
}

/**
 * Handle unhandled promise rejections.
 * @param {PromiseRejectionEvent} event
 */
function handleRejection(event) {
  const entry = ErrorFormatter.format(
    ErrorType.UNHANDLED_REJECTION,
    event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
    { componentHierarchy: [] }
  );

  errors.push(entry);
  outputEntry(entry);
}

/**
 * Intercept console.error calls to capture logged errors.
 * @param {...any} args
 */
function interceptedConsoleError(...args) {
  if (originalConsoleError) {
    originalConsoleError.apply(console, args);
  }

  const firstArg = args[0];
  if (typeof firstArg === 'string' && firstArg.startsWith('[')) return;

  const message = args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join(' ');

  const entry = ErrorFormatter.format(
    ErrorType.CONSOLE_ERROR,
    new Error(message),
    { componentHierarchy: [] }
  );

  errors.push(entry);
}

/**
 * Capture network request failures.
 * @param {Event} event
 */
function handleNetworkError(event) {
  const target = event.target;
  let url = '';
  if (target instanceof Request) {
    url = target.url;
  } else if (target && typeof target === 'object' && 'src' in target) {
    url = target.src;
  }

  const entry = ErrorFormatter.format(
    ErrorType.NETWORK_ERROR,
    new Error(`Network request failed: ${url || 'unknown'}`),
    { componentHierarchy: [] }
  );

  errors.push(entry);
  outputEntry(entry);
}

/**
 * Capture resource loading failures (images, scripts, etc.).
 * @param {Event} event
 */
function handleResourceError(event) {
  const target = event.target;
  let url = '';
  let tagName = '';
  if (target) {
    url = target.src || target.href || '';
    tagName = target.tagName || '';
  }

  const entry = ErrorFormatter.format(
    ErrorType.RESOURCE_ERROR,
    new Error(`Resource failed to load: ${tagName} ${url}`),
    { componentHierarchy: [] }
  );

  errors.push(entry);
  outputEntry(entry);
}

/**
 * Extract React component names from a stack trace.
 * @param {string} stack - The error stack trace.
 * @returns {string[]} Array of component names found in the stack.
 */
function extractComponentNames(stack) {
  if (!stack) return [];

  const components = [];
  const lines = stack.split('\n');

  for (const line of lines) {
    // Look for React component names (PascalCase functions)
    // Common patterns in React stack traces
    const componentMatch = line.match(/at\s+([A-Z][a-zA-Z0-9]*)\s*\(/);
    if (componentMatch) {
      const name = componentMatch[1];
      // Filter out common non-component names
      if (!['Error', 'Promise', 'Object', 'Array', 'Function', 'Symbol', 'React', 'Component'].includes(name)) {
        components.push(name);
      }
    }
  }

  return [...new Set(components)];
}

/**
 * Initialize error logging with global handlers.
 * Must be called once at application startup.
 */
function init() {
  if (initialized) return;
  initialized = true;

  window.onerror = handleError;
  window.onunhandledrejection = handleRejection;

  originalConsoleError = console.error;
  console.error = interceptedConsoleError;

  window.addEventListener('error', handleNetworkError, true);
  window.addEventListener('error', handleResourceError, true);
}

/**
 * Log an error with context.
 * @param {Error} error
 * @param {Partial<import('../types/error-logging.js').ErrorContext>} [context]
 */
function logError(error, context) {
  const entry = ErrorFormatter.format(ErrorType.ERROR, error, context);
  errors.push(entry);
  outputEntry(entry);
}

/**
 * Log a promise rejection with context.
 * @param {unknown} reason
 * @param {Partial<import('../types/error-logging.js').ErrorContext>} [context]
 */
function logRejection(reason, context) {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  const entry = ErrorFormatter.format(ErrorType.UNHANDLED_REJECTION, error, context);
  errors.push(entry);
  outputEntry(entry);
}

/**
 * Get all captured errors.
 * @returns {import('../types/error-logging.js').ErrorLogEntry[]}
 */
function getErrors() {
  return [...errors];
}

/**
 * Clear captured errors.
 */
function clear() {
  errors = [];
}

export const ErrorLogger = {
  init,
  logError,
  logRejection,
  getErrors,
  clear,
  extractComponentNames,
};
