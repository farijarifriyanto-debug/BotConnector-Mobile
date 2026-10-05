import {CONNECTION_TIMEOUT_MS} from './http';

/**
 * Public BotConnector model catalog (the same file botconnector.id renders its
 * model pages from). It is the canonical source for human display names and
 * capability tags; which models an account may actually use still comes from
 * the authenticated /v1/models response.
 */
export const BOTCONNECTOR_CATALOG_URL =
  'https://botconnector.id/data/cloud-models.json';

export interface BotConnectorCatalogModel {
  id: string;
  name?: string;
  displayFamily?: string;
  developer?: string;
  category?: string;
  capabilities?: string[];
}

export type BotConnectorCatalog = Record<string, BotConnectorCatalogModel>;

export function parseBotConnectorCatalog(
  payload: unknown,
): BotConnectorCatalog {
  const models = (payload as {models?: unknown})?.models;
  const catalog: BotConnectorCatalog = {};
  if (!Array.isArray(models)) {
    return catalog;
  }
  for (const raw of models) {
    const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
    if (!id) {
      continue;
    }
    catalog[id] = {
      id,
      name: typeof raw.name === 'string' ? raw.name : undefined,
      displayFamily:
        typeof raw.displayFamily === 'string' ? raw.displayFamily : undefined,
      developer: typeof raw.developer === 'string' ? raw.developer : undefined,
      category: typeof raw.category === 'string' ? raw.category : undefined,
      capabilities: Array.isArray(raw.capabilities)
        ? raw.capabilities.filter((c: unknown) => typeof c === 'string')
        : undefined,
    };
  }
  return catalog;
}

export async function fetchBotConnectorCatalog(
  timeoutMs = CONNECTION_TIMEOUT_MS,
): Promise<BotConnectorCatalog> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(BOTCONNECTOR_CATALOG_URL, {
      headers: {Accept: 'application/json'},
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `BotConnector catalog request failed (${response.status})`,
      );
    }
    return parseBotConnectorCatalog(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
