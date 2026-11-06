export const CONNECTION_TIMEOUT_MS = 30000;
export const IDLE_TIMEOUT_MS = 60000;

/**
 * Single normalization site for a per-server timeout. An undefined, NaN,
 * non-finite, or non-positive value falls back to the supplied default.
 * Callers (stores, engine, sheets) forward raw values; only this layer
 * enforces the floor.
 */
export function resolveTimeout(
  timeoutMs: number | undefined,
  fallback: number,
): number {
  if (timeoutMs == null || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fallback;
  }
  return timeoutMs;
}

/**
 * Build headers for OpenAI-compatible API requests.
 */
export function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Normalize server URL: remove trailing slash.
 */
export function normalizeUrl(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '');
}

/**
 * The base a request path is appended to, always carrying exactly one API
 * version segment.
 *
 * `ServerConfig.url` is a root base for manually added servers
 * ("http://192.168.1.100:1234"), but every provider preset stores a versioned
 * base ("https://api.openai.com/v1", ".../v1beta/openai",
 * "https://openrouter.ai/api/v1"). Appending a hardcoded `/v1` to those
 * produced `/v1/v1/chat/completions` and a 404 for six of the eight presets,
 * so the segment is added only when the base has none.
 */
export function versionedBaseUrl(serverUrl: string): string {
  const base = normalizeUrl(serverUrl);
  return /\/v\d+/i.test(base) ? base : `${base}/v1`;
}
