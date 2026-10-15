/**
 * secret.mjs
 * The ORS API key lives in AWS Secrets Manager (secret "Routing"). Its value
 * may be the bare key or JSON carrying it; both are accepted so the secret
 * can be rotated in either shape.
 */

/**
 * Thrown when the secret's value isn't usable. `reason` is safe to log (it
 * never contains the secret): empty | invalid_json | missing_field | key_in_name.
 */
export class OrsSecretError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'OrsSecretError';
    this.reason = reason;
  }
}

export function parseOrsSecret(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) throw new OrsSecretError('empty', 'ORS secret is empty');
  if (!text.startsWith('{')) return text;
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new OrsSecretError('invalid_json', 'ORS secret is not valid JSON');
  }
  const key = obj.ORS_API_KEY ?? obj.apiKey ?? obj.api_key;
  if (typeof key !== 'string' || !key.trim()) {
    // The console's Key/value editor with the API key typed into the left
    // (key) box and the right (value) box left blank.
    const values = Object.values(obj ?? {});
    if (values.length && values.every((v) => v === '')) {
      throw new OrsSecretError('key_in_name', 'ORS secret has a blank value: put ORS_API_KEY on the left and the key on the right');
    }
    throw new OrsSecretError('missing_field', 'ORS secret JSON has no ORS_API_KEY, apiKey or api_key');
  }
  return key.trim();
}

/** One fetch per cold start; a failed fetch is retried on the next call. */
export function createKeyLoader(getSecretString) {
  let pending = null;
  return () => {
    pending ??= Promise.resolve()
      .then(getSecretString)
      .then(parseOrsSecret)
      .catch((err) => {
        pending = null;
        throw err;
      });
    return pending;
  };
}
