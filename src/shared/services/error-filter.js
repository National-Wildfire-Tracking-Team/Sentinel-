/**
 * error-filter.js
 * Filters sensitive data (API keys, tokens, credentials) from error logs.
 */

/**
 * Sensitive data patterns to redact from error output.
 * @type {RegExp[]}
 */
const SENSITIVE_PATTERNS = [
  // API keys
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([A-Za-z0-9_-]{20,})['"]?/gi,
  // Bearer tokens
  /Bearer\s+[A-Za-z0-9_.-]{20,}/gi,
  // Authorization headers
  /Authorization\s*[:=]\s*['"]?([A-Za-z0-9_.\s-]{20,})['"]?/gi,
  // Supabase keys
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // Mapbox tokens (pk. / sk.)
  /(?:pk|sk)\.[A-Za-z0-9_.-]{20,}/g,
  // Generic secret patterns
  /(?:secret|password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
  // AWS keys
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
  // GitHub tokens
  /ghp_[A-Za-z0-9]{36}/g,
  // Slack tokens
  /xox[bpsar]-[A-Za-z0-9-]{10,}/g,
];

/**
 * Replace sensitive data patterns with [REDACTED].
 * @param {string} content - The content to filter.
 * @returns {string} The filtered content with sensitive data redacted.
 */
function redact(content) {
  if (!content || typeof content !== 'string') return content;

  let result = content;
  for (const pattern of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) => {
      // Keep the prefix/label, redact the value
      const colonIndex = match.indexOf(':');
      const equalsIndex = match.indexOf('=');
      const spaceIndex = match.indexOf(' ');

      let prefix = '';
      if (colonIndex !== -1 && (equalsIndex === -1 || colonIndex < equalsIndex)) {
        prefix = match.slice(0, colonIndex + 1);
      } else if (equalsIndex !== -1) {
        prefix = match.slice(0, equalsIndex + 1);
      } else if (spaceIndex !== -1) {
        prefix = match.slice(0, spaceIndex + 1);
      }

      return prefix ? `${prefix} [REDACTED]` : '[REDACTED]';
    });
  }
  return result;
}

/**
 * Check if content contains sensitive data.
 * @param {string} content - The content to check.
 * @returns {boolean} True if sensitive data is found.
 */
function containsSensitiveData(content) {
  if (!content || typeof content !== 'string') return false;

  for (const pattern of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) return true;
  }
  return false;
}

export const ErrorFilter = {
  redact,
  containsSensitiveData,
};
