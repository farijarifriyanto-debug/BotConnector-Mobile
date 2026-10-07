import type {BotConnectorCatalog} from '../api/botconnectorCatalog';
import type {RemoteModelInfo} from './types';

/**
 * Display helpers for BotConnector Cloud models. The model list itself always
 * comes from the account's /v1/models response (entitlement), never from a
 * hardcoded lineup; the public catalog only supplies names and capability tags.
 */

export type CloudAccessTier = 'free' | 'plan' | 'payg' | 'family' | 'other';

export interface CloudModelBadges {
  vision: boolean;
  think: boolean;
  tools: boolean;
  web: boolean;
}

export interface CloudModelDisplay {
  /** Exact id sent to the API (may be an internal route id such as `payg:...`). */
  remoteModelId: string;
  /** Canonical model id used for catalog lookup. */
  canonicalId: string;
  displayName: string;
  family?: string;
  access: CloudAccessTier;
  badges: CloudModelBadges;
}

const UPPER_TOKENS = new Set(['gpt', 'oss', 'glm', 'ai', 'it', 'ocr', 'tts']);
const DROP_TOKENS = new Set(['free']);

/** `payg:anthropic_direct:claude-sonnet-5-5` -> `claude-sonnet-5-5`. */
export function canonicalCloudModelId(
  row: Pick<RemoteModelInfo, 'id'> &
    Partial<Pick<RemoteModelInfo, 'botconnector_canonical_model'>>,
): string {
  if (row.botconnector_canonical_model) {
    return row.botconnector_canonical_model;
  }
  const id = String(row.id || '');
  if (!id.startsWith('payg:')) {
    return id;
  }
  const rest = id.slice('payg:'.length);
  const colon = rest.indexOf(':');
  return colon >= 0 ? rest.slice(colon + 1) : rest;
}

/** Human-readable fallback when the catalog has no entry for a model id. */
export function humanizeModelId(id: string): string {
  const base = id.split(/[:/]/).filter(Boolean).pop() ?? id;
  const tokens = base.split('-').filter(Boolean);
  const out: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (DROP_TOKENS.has(lower) && tokens.length > 1) {
      continue;
    }
    const prev = out[out.length - 1];
    // "5-5" is a version ("5.5"), keep it as one token.
    if (/^\d+$/.test(token) && prev && /^\d+(\.\d+)*$/.test(prev)) {
      out[out.length - 1] = `${prev}.${token}`;
      continue;
    }
    if (/^\d+(\.\d+)?[bkm]$/i.test(token)) {
      out.push(token.toUpperCase());
    } else if (UPPER_TOKENS.has(lower)) {
      out.push(lower.toUpperCase());
    } else if (/^a\d+b$/i.test(token)) {
      out.push(token.toUpperCase());
    } else {
      out.push(token.charAt(0).toUpperCase() + token.slice(1));
    }
  }
  return out.join(' ') || id;
}

export function cloudAccessTier(access: string | undefined): CloudAccessTier {
  switch (access) {
    case 'free':
    case 'plan':
    case 'payg':
    case 'family':
      return access;
    default:
      return 'other';
  }
}

export function describeCloudModel(
  row: RemoteModelInfo,
  catalog: BotConnectorCatalog,
  account?: {webSearch?: boolean},
): CloudModelDisplay {
  const canonicalId = canonicalCloudModelId(row);
  const entry = catalog[canonicalId] ?? catalog[row.id];
  const tags = new Set((entry?.capabilities ?? []).map(t => t.toLowerCase()));
  const verified = row.botconnector_capabilities;
  // A verified runtime answer wins over a catalog tag; absent means "use the tag".
  const tools =
    typeof verified?.tools === 'boolean' ? verified.tools : tags.has('tools');
  const think =
    typeof verified?.reasoning === 'boolean'
      ? verified.reasoning
      : tags.has('reasoning');
  return {
    remoteModelId: row.id,
    canonicalId,
    displayName: entry?.name || humanizeModelId(canonicalId),
    family: entry?.displayFamily || entry?.developer,
    access: cloudAccessTier(row.botconnector_access),
    badges: {
      vision: tags.has('vision'),
      think,
      tools,
      web: tools && account?.webSearch === true,
    },
  };
}

/**
 * Whether the active BotConnector Cloud model supports tool calling.
 * Contract: tools is a MODEL axis answered by /v1/models (verified runtime
 * capability first, catalog tag as fallback) — never an account axis.
 * Returns `undefined` when nothing answers, so callers keep their fallback
 * instead of blocking on missing data.
 */
export function cloudModelSupportsTools(
  rows: RemoteModelInfo[] | undefined,
  remoteModelId: string | undefined,
  catalog: BotConnectorCatalog,
): boolean | undefined {
  if (!rows || !remoteModelId) {
    return undefined;
  }
  const row = rows.find(item => item.id === remoteModelId);
  if (!row) {
    return undefined;
  }
  const verified = row.botconnector_capabilities?.tools;
  if (typeof verified === 'boolean') {
    return verified;
  }
  const canonicalId = canonicalCloudModelId(row);
  const entry = catalog[canonicalId] ?? catalog[row.id];
  const tags = new Set(
    (entry?.capabilities ?? []).map(tag => tag.toLowerCase()),
  );
  if (tags.has('tools')) {
    return true;
  }
  return undefined;
}

/** Catalog says whether a model reads images; undefined when the catalog is silent. */
export function catalogSupportsVision(
  row: Pick<RemoteModelInfo, 'id'> &
    Partial<Pick<RemoteModelInfo, 'botconnector_canonical_model'>>,
  catalog: BotConnectorCatalog,
): boolean | undefined {
  const entry = catalog[canonicalCloudModelId(row)] ?? catalog[row.id];
  if (!entry?.capabilities) {
    return undefined;
  }
  return entry.capabilities.some(c => c.toLowerCase() === 'vision');
}

/** Only chat models belong in the chat model picker (image/video/tts models do not). */
export function isChatCatalogEntry(
  row: RemoteModelInfo,
  catalog: BotConnectorCatalog,
): boolean {
  const entry = catalog[canonicalCloudModelId(row)] ?? catalog[row.id];
  return !entry?.category || entry.category === 'chat';
}

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

const ACCESS_ORDER: Record<CloudAccessTier, number> = {
  plan: 0,
  family: 1,
  free: 2,
  payg: 3,
  other: 4,
};

export function sortCloudModels(
  models: CloudModelDisplay[],
): CloudModelDisplay[] {
  return [...models].sort(
    (a, b) =>
      ACCESS_ORDER[a.access] - ACCESS_ORDER[b.access] ||
      a.displayName.localeCompare(b.displayName),
  );
}
