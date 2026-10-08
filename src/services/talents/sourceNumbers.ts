/**
 * One numbering for every web source in an answer: web_search results and deep_research pages share it, so the
 * model can cite "[3]" and the app can link that number to its source. The same address keeps its number.
 * Reset at the start of every agent run (see resetSourceNumbers).
 */
let byUrl = new Map<string, number>();

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$)/i.test(k)) {
        u.searchParams.delete(k);
      }
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}

export function resetSourceNumbers(): void {
  byUrl = new Map();
}

export function numberFor(url: string): number {
  const key = normalizeUrl(url);
  const known = byUrl.get(key);
  if (known) {
    return known;
  }
  const n = byUrl.size + 1;
  byUrl.set(key, n);
  return n;
}
