import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';

import {BYOK_PROVIDERS, RETIRED_BYOK_PROVIDER_IDS} from '../api/byokProviders';
import type {ByokProviderId} from '../api/byokProviders';
import {
  removeByokServer,
  syncByokProviderToServer,
} from '../services/byokServerBridge';

// The provider's own copy of the key, used by the provider sheet (show/edit/
// remove) without waking the chat-side server. The bridge writes the SAME
// secret a second time under ServerStore's `pocketpal-server-byok-<id>` so the
// OpenAI transport can read it; both are cleared together on remove. Keeping
// the two in sync matters: a key edited here but not there would leave chat
// calling with a stale credential.
const keychainService = (id: string): string => `botconnector.byok.${id}`;

export interface ByokProviderConfig {
  providerId: ByokProviderId;
  baseUrl: string;
  selectedModels: string[];
  createdAt: number;
}

export interface ByokProviderConfigInput {
  providerId: ByokProviderId;
  baseUrl?: string;
  selectedModels?: string[];
}

const VALID_PROVIDER_IDS = new Set<string>(BYOK_PROVIDERS.map(p => p.id));

class ByokProviderStore {
  providers: ByokProviderConfig[] = [];

  private keys: Partial<Record<ByokProviderId, string>> = {};

  constructor() {
    makeAutoObservable(this);

    // Hydration and key loading both feed the server bridge, so the sync runs
    // only once both have settled — providers saved on older app versions gain
    // their `byok-<id>` servers here.
    Promise.all([
      makePersistable(this, {
        name: 'ByokProviderStore',
        properties: ['providers'],
        storage: AsyncStorage,
      }).then(() => this.normalizeHydratedProviders()),
      this.loadKeysFromSecureStorage(),
    ])
      .then(() => this.retireRemovedProviders())
      .then(() => this.syncAllServers());
  }

  /**
   * A withdrawn preset must not outlive its removal from the list: drop its
   * server (and active model) and both Keychain copies. Idempotent, so it
   * simply runs on every launch.
   */
  private async retireRemovedProviders(): Promise<void> {
    for (const id of RETIRED_BYOK_PROVIDER_IDS) {
      try {
        await removeByokServer(id);
        await Keychain.resetGenericPassword({service: keychainService(id)});
      } catch (error) {
        console.error(`Failed to retire ${id} BYOK provider:`, error);
      }
    }
  }

  normalizeHydratedProviders() {
    runInAction(() => {
      const raw: unknown = this.providers;
      if (!Array.isArray(raw)) {
        this.providers = [];
        return;
      }
      const seen = new Set<string>();
      const cleaned: ByokProviderConfig[] = [];
      for (const entry of raw as Array<Record<string, unknown> | null>) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const providerId = entry.providerId;
        if (
          typeof providerId !== 'string' ||
          !VALID_PROVIDER_IDS.has(providerId) ||
          seen.has(providerId)
        ) {
          continue;
        }
        seen.add(providerId);
        const models = Array.isArray(entry.selectedModels)
          ? entry.selectedModels.filter(
              (model): model is string => typeof model === 'string' && !!model,
            )
          : [];
        cleaned.push({
          providerId: providerId as ByokProviderId,
          baseUrl:
            typeof entry.baseUrl === 'string' ? entry.baseUrl.trim() : '',
          selectedModels: models,
          createdAt:
            typeof entry.createdAt === 'number' &&
            Number.isFinite(entry.createdAt)
              ? entry.createdAt
              : Date.now(),
        });
      }
      this.providers = cleaned;
    });
  }

  private async loadKeysFromSecureStorage(): Promise<void> {
    for (const {id} of BYOK_PROVIDERS) {
      try {
        const credentials = await Keychain.getGenericPassword({
          service: keychainService(id),
        });
        if (credentials) {
          runInAction(() => {
            this.keys[id] = credentials.password;
          });
        }
      } catch (error) {
        console.error(`Failed to load ${id} BYOK key:`, error);
      }
    }
  }

  /**
   * Bridge every saved provider into ServerStore. Runs once after hydration +
   * key load, so providers saved before the bridge existed gain their servers.
   * Errors are logged, never thrown: one broken provider must not block the rest.
   */
  async syncAllServers(): Promise<void> {
    for (const provider of this.providers) {
      try {
        await syncByokProviderToServer(provider.providerId);
      } catch (error) {
        console.error(
          `Failed to sync ${provider.providerId} BYOK server:`,
          error,
        );
      }
    }
  }

  getConfig(providerId: ByokProviderId): ByokProviderConfig | undefined {
    return this.providers.find(p => p.providerId === providerId);
  }

  getKey(providerId: ByokProviderId): string {
    return this.keys[providerId] ?? '';
  }

  hasKey(providerId: ByokProviderId): boolean {
    return (this.keys[providerId] ?? '').trim().length > 0;
  }

  async setKey(providerId: ByokProviderId, key: string): Promise<boolean> {
    try {
      await Keychain.setGenericPassword(providerId, key, {
        service: keychainService(providerId),
      });
      runInAction(() => {
        this.keys[providerId] = key;
      });
      return true;
    } catch (error) {
      console.error(`Failed to save ${providerId} BYOK key:`, error);
      return false;
    }
  }

  async clearKey(providerId: ByokProviderId): Promise<boolean> {
    try {
      await Keychain.resetGenericPassword({
        service: keychainService(providerId),
      });
      runInAction(() => {
        delete this.keys[providerId];
      });
      return true;
    } catch (error) {
      console.error(`Failed to clear ${providerId} BYOK key:`, error);
      return false;
    }
  }

  async saveProvider(
    config: ByokProviderConfigInput,
    apiKey?: string,
  ): Promise<boolean> {
    const providerId = config.providerId;
    const trimmedKey = (apiKey ?? '').trim();
    if (!trimmedKey && !this.hasKey(providerId)) {
      return false;
    }
    if (trimmedKey) {
      const keySaved = await this.setKey(providerId, trimmedKey);
      if (!keySaved) {
        return false;
      }
    }
    const entry: ByokProviderConfig = {
      providerId,
      baseUrl: (config.baseUrl ?? '').trim(),
      selectedModels: Array.isArray(config.selectedModels)
        ? [...config.selectedModels]
        : [],
      createdAt: Date.now(),
    };
    runInAction(() => {
      const index = this.providers.findIndex(p => p.providerId === providerId);
      if (index >= 0) {
        entry.createdAt = this.providers[index].createdAt;
        this.providers[index] = entry;
      } else {
        this.providers.push(entry);
      }
    });
    // Bridge into ServerStore so the provider is chat-able. A bridge failure
    // (e.g. Keychain rollback) is reported as a save failure — the config stays
    // persisted and the next hydration sync retries it.
    try {
      await syncByokProviderToServer(providerId);
    } catch (error) {
      console.error(`Failed to sync ${providerId} BYOK server:`, error);
      return false;
    }
    return true;
  }

  async removeProvider(providerId: ByokProviderId): Promise<boolean> {
    const keyCleared = await this.clearKey(providerId);
    if (!keyCleared) {
      return false;
    }
    runInAction(() => {
      this.providers = this.providers.filter(p => p.providerId !== providerId);
    });
    try {
      await removeByokServer(providerId);
    } catch (error) {
      // The provider config is gone; a leftover server is retried at next sync.
      console.error(`Failed to remove ${providerId} BYOK server:`, error);
    }
    return true;
  }
}

export const byokProviderStore = new ByokProviderStore();
export {ByokProviderStore};
