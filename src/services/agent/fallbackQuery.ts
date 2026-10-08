/**
 * Some models (small ones, or after a long tool conversation) call web_search / deep_research with no arguments.
 * Instead of showing an error, the call is completed from what the user just asked.
 */
const MAX_QUERY_CHARS = 240;

export function lastUserQuery(
  messages: ReadonlyArray<any> | undefined,
): string {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
    const m = messages![i];
    if (m?.role !== 'user') {
      continue;
    }
    const text =
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
              .join(' ')
          : '';
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean) {
      return clean.slice(0, MAX_QUERY_CHARS);
    }
  }
  return '';
}

const hasText = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/** Fills a missing search argument from `fallback`; every other call is returned untouched. */
export function withSearchFallback(
  toolName: string,
  args: Record<string, unknown>,
  fallback: string | undefined,
): Record<string, unknown> {
  if (!fallback) {
    return args;
  }
  if (toolName === 'web_search' && !hasText(args.query)) {
    return {...args, query: fallback};
  }
  if (toolName === 'deep_research') {
    const list = Array.isArray(args.queries) ? args.queries : [];
    if (!list.some(hasText) && !hasText(args.query)) {
      return {...args, queries: [fallback]};
    }
  }
  return args;
}
