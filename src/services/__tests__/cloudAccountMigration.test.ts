import {AppState} from 'react-native';
import {runInAction} from 'mobx';
import {isHydrated} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';

jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
  isHydrated: jest.fn(() => true),
}));

jest.mock('../../api/openai', () => ({
  fetchModels: jest.fn().mockResolvedValue([]),
  testConnection: jest.fn(),
}));

jest.mock('../../api/llamaServer/props', () => ({
  fetchServerProps: jest.fn(),
  PROPS_TIMEOUT_MS: 5000,
}));

// Keep the ModelStore singleton (and its background device-signal async
// work, which outlives the test env) out of this suite: ChatSessionStore
// only needs deriveToolSchemas from it.
jest.mock('../talents', () => ({
  deriveToolSchemas: jest.fn().mockReturnValue([]),
}));

jest
  .spyOn(AppState, 'addEventListener')
  .mockImplementation(jest.fn().mockReturnValue({remove: jest.fn()}));

import {serverStore} from '../../store/ServerStore';
import {uiStore} from '../../store/UIStore';
import {chatSessionStore} from '../../store/ChatSessionStore';
import {runCloudAccountMigration} from '../cloudAccountMigration';

const keychainGet = Keychain.getGenericPassword as jest.Mock;
const keychainReset = Keychain.resetGenericPassword as jest.Mock;

const CLOUD_URL = 'https://api.botconnector.id';

function addCloudServer(id: string) {
  serverStore.addServer({name: 'BotConnector', url: CLOUD_URL}, id);
}

describe('runCloudAccountMigration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    keychainGet.mockResolvedValue(false);
    runInAction(() => {
      serverStore.servers = [];
      uiStore.hasCompletedOnboarding = true;
      uiStore.cloudAccountMigrated = false;
      chatSessionStore.sessions = [];
      chatSessionStore.activeSessionId = null;
    });
  });

  it('removes OAuth-created Cloud servers and clears both Keychain entries', async () => {
    keychainGet.mockResolvedValue({username: 'session', password: 'token'});
    addCloudServer('server-cloud');
    serverStore.addServer(
      {name: 'OpenAI', url: 'https://api.openai.com/v1'},
      'server-other',
    );

    await runCloudAccountMigration();

    expect(
      serverStore.servers.find(s => s.id === 'server-cloud'),
    ).toBeUndefined();
    expect(
      serverStore.servers.find(s => s.id === 'server-other'),
    ).toBeDefined();
    expect(keychainReset).toHaveBeenCalledWith({
      service: 'botconnector-native-auth-v1',
    });
    expect(keychainReset).toHaveBeenCalledWith({
      service: 'botconnector-native-login-pending-v1',
    });
    expect(uiStore.cloudAccountMigrated).toBe(true);
  });

  it('keeps a manually-added api.botconnector.id server when no OAuth session exists', async () => {
    keychainGet.mockResolvedValue(false);
    addCloudServer('server-manual');

    await runCloudAccountMigration();

    expect(
      serverStore.servers.find(s => s.id === 'server-manual'),
    ).toBeDefined();
    expect(uiStore.cloudAccountMigrated).toBe(true);
  });

  it('is a no-op on the second run', async () => {
    keychainGet.mockResolvedValue({username: 'session', password: 'token'});
    addCloudServer('server-cloud');

    await runCloudAccountMigration();
    keychainGet.mockClear();
    keychainReset.mockClear();

    await runCloudAccountMigration();

    expect(keychainGet).not.toHaveBeenCalled();
    expect(keychainReset).not.toHaveBeenCalled();
  });

  it('does not run before onboarding completes', async () => {
    keychainGet.mockResolvedValue({username: 'session', password: 'token'});
    addCloudServer('server-cloud');
    runInAction(() => {
      uiStore.hasCompletedOnboarding = false;
    });

    await runCloudAccountMigration();

    expect(
      serverStore.servers.find(s => s.id === 'server-cloud'),
    ).toBeDefined();
    expect(uiStore.cloudAccountMigrated).toBe(false);
    expect(keychainReset).not.toHaveBeenCalled();
  });

  it('leaves the chat session store untouched', async () => {
    keychainGet.mockResolvedValue({username: 'session', password: 'token'});
    addCloudServer('server-cloud');
    const session = {
      id: 'session-1',
      title: 'old chat',
      createdAt: 1,
      updatedAt: 2,
      activePalId: undefined,
    };
    runInAction(() => {
      // @ts-expect-error minimal SessionMetaData fixture
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = 'session-1';
    });

    await runCloudAccountMigration();

    expect(chatSessionStore.sessions).toEqual([session]);
    expect(chatSessionStore.activeSessionId).toBe('session-1');
  });

  it('waits for server hydration instead of migrating on an empty list', async () => {
    keychainGet.mockResolvedValue({username: 'session', password: 'token'});
    addCloudServer('server-cloud');
    (isHydrated as jest.Mock).mockReturnValueOnce(false);

    await runCloudAccountMigration();

    // Nothing removed, and the flag stays unset so the next launch retries.
    expect(
      serverStore.servers.find(s => s.id === 'server-cloud'),
    ).toBeDefined();
    expect(uiStore.cloudAccountMigrated).toBe(false);
  });
});
