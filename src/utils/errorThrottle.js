/**
 * errorThrottle.js
 * Lightweight error logging utility with message throttling and deduplication.
 * 
 * Prevents console flooding during outages by throttling identical error messages.
 * Maintains a cache of recently logged messages with configurable TTL.
 */

// Cache for throttled error messages
const throttleCache = new Map();

// Default TTL: 5 minutes
const DEFAULT_TTL_MS = 5 * 60 * 1000;

// User-friendly error messages
const FRIENDLY_MESSAGES = {
  'FIRMS': {
    'supabase': 'Fire data service temporarily unavailable. Using alternative source.',
    'netlify': 'Alternative fire data service unavailable. Using cached data.',
    'demo': 'No API key configured. Showing demo data.',
    'generic': 'Unable to load fire data. Please try again later.',
  },
  'FIRIS': {
    'unavailable': 'California fire perimeter data temporarily unavailable.',
    'generic': 'Unable to load fire perimeter data.',
  },
  'NIFC': {
    'generic': 'Fire perimeter data temporarily unavailable.',
  },
  'CAL FIRE': {
    'generic': 'CAL FIRE data temporarily unavailable.',
  },
  'NHC': {
    'generic': 'Storm data temporarily unavailable.',
  },
};

/**
 * Generate a hash key for an error message to enable deduplication.
 * @param {string} message - The error message
 * @returns {string} - A hash key for the message
 */
function getMessageKey(message) {
  // Simple hash: take first 100 chars and normalize whitespace
  const normalized = message.slice(0, 100).replace(/\s+/g, ' ').trim();
  return normalized;
}

/**
 * Check if a message should be logged based on throttle state.
 * @param {string} key - The message key
 * @param {number} ttlMs - Time-to-live in milliseconds
 * @returns {boolean} - True if message should be logged
 */
function shouldLog(key, ttlMs) {
  const now = Date.now();
  const lastLogged = throttleCache.get(key);
  
  if (lastLogged === undefined || now - lastLogged > ttlMs) {
    throttleCache.set(key, now);
    return true;
  }
  
  return false;
}

/**
 * Get a user-friendly error message for a given tag and error type.
 * @param {string} tag - The error tag (e.g., 'FIRMS', 'FIRIS')
 * @param {string} type - The error type (e.g., 'supabase', 'netlify')
 * @returns {string} - A user-friendly message
 */
export function getFriendlyMessage(tag, type = 'generic') {
  const tagMessages = FRIENDLY_MESSAGES[tag];
  if (!tagMessages) return 'An error occurred. Please try again later.';
  return tagMessages[type] || tagMessages['generic'] || 'An error occurred. Please try again later.';
}

/**
 * Log an error with throttling to prevent console flooding.
 * @param {string} tag - The error tag (e.g., '[FIRMS]', '[FIRIS]')
 * @param {string} message - The error message
 * @param {Error} [error] - Optional error object for stack trace
 * @param {object} [opts] - Options
 * @param {number} [opts.ttlMs] - Custom TTL in milliseconds
 * @param {string} [opts.friendlyType] - Type for friendly message lookup
 * @param {boolean} [opts.force] - Force logging regardless of throttle
 * @returns {string} - The user-friendly message (for UI display)
 */
export function throttleError(tag, message, error = null, opts = {}) {
  const {
    ttlMs = DEFAULT_TTL_MS,
    friendlyType = 'generic',
    force = false,
  } = opts;
  
  const fullMessage = `${tag} ${message}`;
  const key = getMessageKey(fullMessage);
  
  if (force || shouldLog(key, ttlMs)) {
    // Log the detailed error to console
    if (error) {
      console.warn(fullMessage, error);
    } else {
      console.warn(fullMessage);
    }
  }
  
  // Always return friendly message for UI
  return getFriendlyMessage(tag.replace(/[\[\]]/g, '').trim(), friendlyType);
}

/**
 * Clear the throttle cache (useful for testing or forced refresh).
 */
export function clearThrottleCache() {
  throttleCache.clear();
}

/**
 * Get current throttle cache stats (for debugging).
 * @returns {object} - Cache statistics
 */
export function getThrottleStats() {
  return {
    size: throttleCache.size,
    entries: Array.from(throttleCache.entries()).map(([key, timestamp]) => ({
      key,
      timestamp,
      age: Date.now() - timestamp,
    })),
  };
}

// Clean up old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of throttleCache.entries()) {
    if (now - timestamp > DEFAULT_TTL_MS * 2) {
      throttleCache.delete(key);
    }
  }
}, DEFAULT_TTL_MS);
