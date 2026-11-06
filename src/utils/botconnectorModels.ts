/**
 * Search matching shared by the model pickers. (This module used to also host
 * the BotConnector Cloud catalog helpers; those were removed with the Cloud
 * capability/catalog layer — every remote server is now user-configured.)
 */

export function matchesModelSearch(
  query: string,
  fields: Array<string | undefined>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const haystack = fields.filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every(part => haystack.includes(part));
}
