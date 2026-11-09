import {getProviderMeta} from '../api/byokProviders';
import type {ByokProviderId} from '../api/byokProviders';
import {byokProviderStore} from '../store/ByokProviderStore';
import type {ByokProviderStore} from '../store/ByokProviderStore';
import {serverStore} from '../store/ServerStore';
import type {ServerStore} from '../store/ServerStore';
import {modelStore} from '../store/ModelStore';

/**
 * The bridge that makes a saved BYOK provider chat-able: every provider in
 * ByokProviderStore gets exactly one ServerStore server (`byok-<providerId>`),
 * its Keychain key, and its selected models — so the tested ServerStore →
 * ModelStore → engine chat path serves BYOK providers unchanged.
 */

/** Prefix every bridge-owned server id carries; the manual add path skips them. */
export const BYOK_SERVER_ID_PREFIX = 'byok-';

export const byokServerId = (providerId: string): string =>
  `${BYOK_SERVER_ID_PREFIX}${providerId}`;

/** The narrow slice of ModelStore the bridge touches (injectable for tests). */
export interface BridgeModelStore {
  activeModelId: string | undefined;
  releaseContext(clearActiveModel?: boolean): Promise<void>;
}

export interface BridgeDeps {
  byok?: ByokProviderStore;
  servers?: ServerStore;
  models?: BridgeModelStore;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Upsert the provider's server. Returns the server id, or null when there is
 * no saved config or no key. Idempotent: the deterministic id means a repeat
 * sync updates in place.
 *
 * Keychain safety: `setApiKey` swallows write failures, so the write is
 * verified by read-back. A failed write on a NEW server rolls the server back
 * (no keyless server is ever left behind); a failed write on an EXISTING
 * server leaves the previously working server in place and throws.
 */
export async function syncByokProviderToServer(
  providerId: ByokProviderId,
  deps: BridgeDeps = {},
): Promise<string | null> {
  const byok = deps.byok ?? byokProviderStore;
  const servers = deps.servers ?? serverStore;

  const config = byok.getConfig(providerId);
  const key = byok.getKey(providerId).trim();
  if (!config || !key) {
    return null;
  }

  const meta = getProviderMeta(providerId);
  const url = config.baseUrl || meta.defaultBaseUrl;
  const name = meta.id === 'generic' ? `Custom (${hostOf(url)})` : meta.label;
  const serverType = meta.transport === 'anthropic' ? 'Anthropic' : 'OpenAI';

  const id = byokServerId(providerId);
  const existed = servers.servers.some(s => s.id === id);
  if (existed) {
    servers.updateServer(id, {name, url, serverType});
  } else {
    servers.addServer({name, url, serverType}, id);
  }

  try {
    await servers.setApiKey(id, key);
    const readBack = await servers.getApiKey(id);
    if (readBack !== key) {
      throw new Error('API key write verification failed');
    }
  } catch (error) {
    if (!existed) {
      servers.removeServer(id);
    }
    throw error;
  }

  // Replace the server's selected models with the config's list.
  const wanted = new Set(config.selectedModels);
  for (const selected of servers.getUserSelectedModelsForServer(id)) {
    if (!wanted.has(selected.remoteModelId)) {
      servers.removeUserSelectedModel(id, selected.remoteModelId);
    }
  }
  for (const remoteModelId of config.selectedModels) {
    servers.addUserSelectedModel(id, remoteModelId);
  }

  // Refresh the live model list; failure must not undo a good sync.
  servers.fetchModelsForServer(id).catch(() => {});

  return id;
}

/**
 * Remove the provider's server, its Keychain key and its selected models, and
 * release the active chat model if it pointed at this server.
 */
export async function removeByokServer(
  providerId: string,
  deps: BridgeDeps = {},
): Promise<void> {
  const servers = deps.servers ?? serverStore;
  const models = deps.models ?? modelStore;

  const id = byokServerId(providerId);
  // Release first: a previous removal that died between removeServer and the
  // release leaves no server but a still-bound active model, and returning on
  // "no server" would leave chat calling a released engine.
  servers.removeServer(id);

  if (models.activeModelId?.startsWith(`${id}/`)) {
    await models.releaseContext(true);
  }
}
