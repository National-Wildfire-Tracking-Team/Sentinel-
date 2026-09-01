/**
 * error-logging.js
 * Type definitions for production error logging feature.
 */

/**
 * @enum {string}
 * Classification of error types.
 */
export const ErrorType = Object.freeze({
  /** Uncaught JavaScript errors */
  ERROR: 'error',
  /** Unhandled promise rejections */
  UNHANDLED_REJECTION: 'unhandledRejection',
  /** Errors logged via console.error */
  CONSOLE_ERROR: 'consoleError',
  /** Network request failures */
  NETWORK_ERROR: 'networkError',
  /** Resource loading failures */
  RESOURCE_ERROR: 'resourceError',
});

/**
 * @typedef {Object} ErrorContext
 * @property {string} url - Current page URL
 * @property {string} userAgent - Browser user agent string
 * @property {string} viewport - Viewport dimensions (e.g., "1920x1080")
 * @property {string} pageTitle - Current page title
 * @property {string[]} [componentHierarchy] - React component tree (if applicable)
 */

/**
 * @typedef {Object} ErrorLogEntry
 * @property {ErrorType} type - Classification of the error
 * @property {string} message - Error message text
 * @property {string} [source] - Source file URL or identifier
 * @property {number} [line] - Line number (if available)
 * @property {number} [column] - Column number (if available)
 * @property {string} [stackTrace] - Full stack trace (if available)
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {ErrorContext} context - Application state at time of error
 * @property {boolean} filtered - Whether sensitive data was redacted
 */
