import * as Keychain from 'react-native-keychain';
import {makePersistable} from 'mobx-persist-store';

import {ByokProviderStore} from '../ByokProviderStore';

const persistMock = makePersistable as jest.Mock;

const setMock = Keychain.setGenericPassword as jest.Mock;
const getMock = Keychain.getGenericPassword as jest.Mock;
const resetMock = Keychain.resetGenericPassword as jest.Mock;

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('ByokProviderStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMock.mockResolvedValue(false);
    setMock.mockResolvedValue(true);
    resetMock.mockResolvedValue(true);
  });

  const newStore = async () => {
    const store = new ByokProviderStore();
    await flush();
    return store;
  };

  describe('initial state', () => {
    it('starts with no saved providers', async () => {
      const store = await newStore();
      expect(store.providers).toEqual([]);
      expect(store.getConfig('openai')).toBeUndefined();
    });

    it('reads each provider key under its own keychain service on load', async () => {
      await newStore();
      for (const id of ['openai', 'anthropic', 'gemini', 'generic']) {
        expect(getMock).toHaveBeenCalledWith({
          service: `botconnector.byok.${id}`,
        });
      }
    });
  });

  describe('secure-store boundary', () => {
    it('persists only provider configs, never a key field', async () => {
      await newStore();
      const config = persistMock.mock.calls[0][1];
      expect(config.properties).toEqual(['providers']);
      expect(JSON.stringify(config.properties)).not.toMatch(/key/i);
    });

    it('keeps the API key out of persisted state', async () => {
      const store = await newStore();
      const saved = await store.saveProvider(
        {
          providerId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          selectedModels: ['gpt-test'],
        },
        'sk-secret-value',
      );

      expect(saved).toBe(true);
      expect(setMock).toHaveBeenCalledWith('openai', 'sk-secret-value', {
        service: 'botconnector.byok.openai',
      });
      expect(JSON.stringify(store.providers)).not.toContain('sk-secret-value');
    });

    it('exposes the key only through the in-memory mirror', async () => {
      const store = await newStore();
      await store.saveProvider(
        {providerId: 'anthropic', selectedModels: ['claude-test']},
        'sk-ant-secret',
      );

      expect(store.getKey('anthropic')).toBe('sk-ant-secret');
      expect(store.hasKey('anthropic')).toBe(true);
      expect(store.hasKey('openai')).toBe(false);
    });
  });

  describe('saveProvider', () => {
    it('refuses to save without any key', async () => {
      const store = await newStore();

      const saved = await store.saveProvider({
        providerId: 'openai',
        selectedModels: ['a'],
      });

      expect(saved).toBe(false);
      expect(store.providers).toEqual([]);
      expect(setMock).not.toHaveBeenCalled();
    });

    it('keeps the existing key when re-saving with an empty key', async () => {
      const store = await newStore();
      await store.saveProvider(
        {providerId: 'openai', selectedModels: ['a']},
        'sk-first',
      );
      setMock.mockClear();

      const saved = await store.saveProvider(
        {providerId: 'openai', selectedModels: ['a', 'b']},
        '',
      );

      expect(saved).toBe(true);
      expect(setMock).not.toHaveBeenCalled();
      expect(store.getConfig('openai')?.selectedModels).toEqual(['a', 'b']);
    });

    it('does not persist the config when the keychain write fails', async () => {
      const store = await newStore();
      setMock.mockRejectedValueOnce(new Error('keychain unavailable'));

      const saved = await store.saveProvider(
        {providerId: 'openai', selectedModels: ['a']},
        'sk-fail',
      );

      expect(saved).toBe(false);
      expect(store.providers).toEqual([]);
    });

    it('upserts a single entry per provider', async () => {
      const store = await newStore();
      await store.saveProvider(
        {
          providerId: 'generic',
          baseUrl: 'https://a.server',
          selectedModels: ['m1'],
        },
        'k1',
      );
      await store.saveProvider(
        {
          providerId: 'generic',
          baseUrl: 'https://a.server/v2',
          selectedModels: ['m2'],
        },
        'k2',
      );

      expect(store.providers).toHaveLength(1);
      expect(store.getConfig('generic')).toMatchObject({
        baseUrl: 'https://a.server/v2',
        selectedModels: ['m2'],
      });
    });

    it('keeps different providers separate', async () => {
      const store = await newStore();
      await store.saveProvider(
        {providerId: 'openai', selectedModels: ['a']},
        'k-openai',
      );
      await store.saveProvider(
        {providerId: 'gemini', selectedModels: ['b']},
        'k-gemini',
      );

      expect(store.providers).toHaveLength(2);
      expect(store.getConfig('openai')?.selectedModels).toEqual(['a']);
      expect(store.getConfig('gemini')?.selectedModels).toEqual(['b']);
    });
  });

  describe('removeProvider', () => {
    it('clears the credential and the config together', async () => {
      const store = await newStore();
      await store.saveProvider(
        {providerId: 'openai', selectedModels: ['a']},
        'sk-secret',
      );

      const removed = await store.removeProvider('openai');

      expect(removed).toBe(true);
      expect(resetMock).toHaveBeenCalledWith({
        service: 'botconnector.byok.openai',
      });
      expect(store.providers).toEqual([]);
      expect(store.hasKey('openai')).toBe(false);
      expect(store.getKey('openai')).toBe('');
    });

    it('keeps the config when the keychain clear fails', async () => {
      const store = await newStore();
      await store.saveProvider(
        {providerId: 'openai', selectedModels: ['a']},
        'sk-secret',
      );
      resetMock.mockRejectedValueOnce(new Error('keychain unavailable'));

      const removed = await store.removeProvider('openai');

      expect(removed).toBe(false);
      expect(store.getConfig('openai')).toBeDefined();
      expect(store.hasKey('openai')).toBe(true);
    });
  });

  describe('hydration normalization', () => {
    it('drops malformed and unknown entries', async () => {
      const store = await newStore();
      (store as any).providers = [
        null,
        'junk',
        {providerId: 'not-a-provider', selectedModels: []},
        {
          providerId: 'openai',
          baseUrl: 42,
          selectedModels: ['ok', 7, null],
          createdAt: 'bad',
        },
        {providerId: 'openai', selectedModels: ['dupe']},
      ];
      store.normalizeHydratedProviders();

      expect(store.providers).toEqual([
        {
          providerId: 'openai',
          baseUrl: '',
          selectedModels: ['ok'],
          createdAt: expect.any(Number),
        },
      ]);
    });

    it('replaces a non-array providers value with an empty list', async () => {
      const store = await newStore();
      (store as any).providers = {oops: true};
      store.normalizeHydratedProviders();

      expect(store.providers).toEqual([]);
    });
  });
});
