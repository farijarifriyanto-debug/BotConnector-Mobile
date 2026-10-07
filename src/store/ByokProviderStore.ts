import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';

import {BYOK_PROVIDERS} from '../api/byokProviders';
import type {ByokProviderId} from '../api/byokProviders';

const keychainService = (id: ByokProviderId): string =>
  `botconnector.byok.${id}`;

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

    makePersistable(this, {
      name: 'ByokProviderStore',
      properties: ['providers'],
      storage: AsyncStorage,
    }).then(() => this.normalizeHydratedProviders());

    this.loadKeysFromSecureStorage();
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

  private async loadKeysFromSecureStorage() {
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
    return true;
  }
}

export const byokProviderStore = new ByokProviderStore();
export {ByokProviderStore};
