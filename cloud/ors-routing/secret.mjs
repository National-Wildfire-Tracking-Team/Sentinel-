/**
 * secret.mjs
 * The ORS API key lives in AWS Secrets Manager (secret "Routing"). Its value
 * may be the bare key or JSON carrying it; both are accepted so the secret
 * can be rotated in either shape.
 */

export function parseOrsSecret(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) throw new Error('ORS secret is empty');
  if (!text.startsWith('{')) return text;
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('ORS secret is not valid JSON');
  }
  const key = obj.ORS_API_KEY ?? obj.apiKey ?? obj.api_key;
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('ORS secret JSON has no ORS_API_KEY, apiKey or api_key');
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
