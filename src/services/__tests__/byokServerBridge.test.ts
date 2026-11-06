import {AppState} from 'react-native';
import {runInAction} from 'mobx';
import * as Keychain from 'react-native-keychain';

jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));

jest.mock('../../api/openai', () => ({
  fetchModels: jest.fn().mockResolvedValue([]),
  testConnection: jest.fn(),
}));

jest.mock('../../api/llamaServer/props', () => ({
  fetchServerProps: jest.fn(),
  PROPS_TIMEOUT_MS: 5000,
}));

jest
  .spyOn(AppState, 'addEventListener')
  .mockImplementation(jest.fn().mockReturnValue({remove: jest.fn()}));

import {ServerStore} from '../../store/ServerStore';
import {ByokProviderStore} from '../../store/ByokProviderStore';
import {removeByokServer, syncByokProviderToServer} from '../byokServerBridge';
import type {ByokProviderId} from '../../api/byokProviders';

const keychainSet = Keychain.setGenericPassword as jest.Mock;
const keychainGet = Keychain.getGenericPassword as jest.Mock;
const keychainReset = Keychain.resetGenericPassword as jest.Mock;

/** The narrow slice of ModelStore the bridge needs. */
const fakeModelStore = (activeModelId: string | undefined) => ({
  activeModelId,
  releaseContext: jest.fn().mockResolvedValue(undefined),
});

/** A fresh store pair with one configured provider, no bridge wiring fired. */
async function primedStores(
  providerId: ByokProviderId,
  key: string,
  selectedModels: string[] = [],
) {
  const servers = new ServerStore();
  const byok = new ByokProviderStore();
  runInAction(() => {
    byok.providers = [{providerId, baseUrl: '', selectedModels, createdAt: 1}];
    (byok as any).keys[providerId] = key;
  });
  return {servers, byok};
}

describe('byokServerBridge', () => {
  // Stateful Keychain stand-in: the read-back verification the bridge runs
  // can only pass against a mock that actually remembers writes.
  let keychainData: Record<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
    keychainData = {};
    keychainSet.mockImplementation(
      (_u: string, password: string, opts: {service: string}) => {
        keychainData[opts.service] = password;
        return Promise.resolve(true);
      },
    );
    keychainGet.mockImplementation((opts: {service: string}) =>
      Promise.resolve(
        keychainData[opts.service]
          ? {username: 'apiKey', password: keychainData[opts.service]}
          : false,
      ),
    );
    keychainReset.mockImplementation((opts: {service: string}) => {
      delete keychainData[opts.service];
      return Promise.resolve(true);
    });
  });

  it('syncs a saved provider into a byok-<id> server with key and models', async () => {
    const {servers, byok} = await primedStores('openai', 'sk-test', [
      'gpt-a',
      'gpt-b',
    ]);

    const id = await syncByokProviderToServer('openai', {
      byok,
      servers,
      models: fakeModelStore(undefined),
    });

    expect(id).toBe('byok-openai');
    const server = servers.servers.find(s => s.id === 'byok-openai');
    expect(server).toMatchObject({
      name: 'OpenAI',
      url: 'https://api.openai.com/v1',
      serverType: 'OpenAI',
    });
    expect(keychainSet).toHaveBeenCalledWith('apiKey', 'sk-test', {
      service: 'pocketpal-server-byok-openai',
    });
    expect(servers.getUserSelectedModelsForServer('byok-openai')).toEqual([
      {serverId: 'byok-openai', remoteModelId: 'gpt-a'},
      {serverId: 'byok-openai', remoteModelId: 'gpt-b'},
    ]);
  });

  it('is idempotent: a second sync updates in place, never duplicates', async () => {
    const {servers, byok} = await primedStores('openai', 'sk-test', ['gpt-a']);
    const deps = {byok, servers, models: fakeModelStore(undefined)};

    await syncByokProviderToServer('openai', deps);
    runInAction(() => {
      byok.providers = [
        {
          providerId: 'openai',
          baseUrl: '',
          selectedModels: ['gpt-c'],
          createdAt: 1,
        },
      ];
    });
    await syncByokProviderToServer('openai', deps);

    expect(servers.servers.filter(s => s.id === 'byok-openai')).toHaveLength(1);
    // The selected-model list is replaced, not appended.
    expect(servers.getUserSelectedModelsForServer('byok-openai')).toEqual([
      {serverId: 'byok-openai', remoteModelId: 'gpt-c'},
    ]);
  });

  it('types an Anthropic-transport provider as an Anthropic server', async () => {
    const {servers, byok} = await primedStores('anthropic', 'sk-ant');

    await syncByokProviderToServer('anthropic', {
      byok,
      servers,
      models: fakeModelStore(undefined),
    });

    expect(servers.servers.find(s => s.id === 'byok-anthropic')).toMatchObject({
      serverType: 'Anthropic',
      url: 'https://api.anthropic.com/v1',
    });
  });

  it('returns null when no config or no key exists', async () => {
    const servers = new ServerStore();
    const byok = new ByokProviderStore();

    await expect(
      syncByokProviderToServer('openai', {
        byok,
        servers,
        models: fakeModelStore(undefined),
      }),
    ).resolves.toBeNull();
    expect(servers.servers).toHaveLength(0);
  });

  it('removes the server, its Keychain key and its selected models', async () => {
    const {servers, byok} = await primedStores('openai', 'sk-test', ['gpt-a']);
    const deps = {byok, servers, models: fakeModelStore(undefined)};
    await syncByokProviderToServer('openai', deps);

    await removeByokServer('openai', deps);

    expect(servers.servers.find(s => s.id === 'byok-openai')).toBeUndefined();
    expect(keychainReset).toHaveBeenCalledWith({
      service: 'pocketpal-server-byok-openai',
    });
    expect(servers.getUserSelectedModelsForServer('byok-openai')).toEqual([]);
  });

  it('releases the active model when it belonged to the removed server', async () => {
    const {servers, byok} = await primedStores('openai', 'sk-test', ['gpt-a']);
    const models = fakeModelStore('byok-openai/gpt-a');
    await syncByokProviderToServer('openai', {byok, servers, models});

    await removeByokServer('openai', {byok, servers, models});

    expect(models.releaseContext).toHaveBeenCalledWith(true);
  });

  it('leaves an unrelated active model alone on remove', async () => {
    const {servers, byok} = await primedStores('openai', 'sk-test', ['gpt-a']);
    const models = fakeModelStore('server-elsewhere/some-model');
    await syncByokProviderToServer('openai', {byok, servers, models});

    await removeByokServer('openai', {byok, servers, models});

    expect(models.releaseContext).not.toHaveBeenCalled();
  });

  it('rolls back a just-created server when the key write rejects', async () => {
    const {servers, byok} = await primedStores('openai', 'sk-test');
    jest
      .spyOn(servers, 'setApiKey')
      .mockRejectedValueOnce(new Error('keychain full'));

    await expect(
      syncByokProviderToServer('openai', {
        byok,
        servers,
        models: fakeModelStore(undefined),
      }),
    ).rejects.toThrow('keychain full');

    // No keyless server is left behind.
    expect(servers.servers.find(s => s.id === 'byok-openai')).toBeUndefined();
  });

  it('rolls back when the key read-back does not match', async () => {
    const {servers, byok} = await primedStores('openai', 'sk-test');
    // setApiKey swallows Keychain failures in production, so a silent no-write
    // must roll back just like a rejection.
    keychainGet.mockResolvedValue(false);

    await expect(
      syncByokProviderToServer('openai', {
        byok,
        servers,
        models: fakeModelStore(undefined),
      }),
    ).rejects.toThrow();

    expect(servers.servers.find(s => s.id === 'byok-openai')).toBeUndefined();
  });

  it('keeps a pre-existing server when a re-sync key write fails', async () => {
    const {servers, byok} = await primedStores('openai', 'sk-test');
    const deps = {byok, servers, models: fakeModelStore(undefined)};
    await syncByokProviderToServer('openai', deps);

    jest
      .spyOn(servers, 'setApiKey')
      .mockRejectedValueOnce(new Error('keychain full'));

    await expect(syncByokProviderToServer('openai', deps)).rejects.toThrow(
      'keychain full',
    );
    // The previously working server is not destroyed by a failed update.
    expect(servers.servers.find(s => s.id === 'byok-openai')).toBeDefined();
  });

  it('releases the active model even when the server is already gone', async () => {
    const {servers, byok} = await primedStores('openai', 'sk-test', ['gpt-a']);
    const models = fakeModelStore('byok-openai/gpt-a');
    await syncByokProviderToServer('openai', {byok, servers, models});

    // A previous removal that failed between removeServer and the release
    // leaves exactly this state: no server, still-bound active model.
    servers.removeServer('byok-openai');

    await removeByokServer('openai', {byok, servers, models});

    expect(models.releaseContext).toHaveBeenCalledWith(true);
  });
});
