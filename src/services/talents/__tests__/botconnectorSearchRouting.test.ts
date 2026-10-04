jest.mock('../../../store/ModelStore', () => ({
  modelStore: {activeRemoteBinding: undefined},
}));
jest.mock('../../../store/ServerStore', () => ({
  serverStore: {getApiKey: jest.fn()},
}));
jest.mock('../../../store/SearchProviderStore', () => ({
  searchProviderStore: {
    activeProviderId: 'brave',
    resultCount: 5,
    hasConsentedToSearch: true,
    isProviderConfigured: false,
    getKey: jest.fn().mockReturnValue(''),
  },
}));

import {createSearchAccess} from '../index';
import {modelStore} from '../../../store/ModelStore';
import {serverStore} from '../../../store/ServerStore';
import {searchProviderStore} from '../../../store/SearchProviderStore';

describe('BotConnector search routing', () => {
  const mockedModelStore = modelStore as typeof modelStore & {
    activeRemoteBinding?: any;
  };
  const mockedServerStore = serverStore as jest.Mocked<typeof serverStore>;
  const mockedSearchStore =
    searchProviderStore as typeof searchProviderStore & {
      hasConsentedToSearch: boolean;
      isProviderConfigured: boolean;
    };

  beforeEach(() => {
    mockedModelStore.activeRemoteBinding = {
      modelId: 'server-bc/gpt-test',
      serverId: 'server-bc',
      remoteModelId: 'gpt-test',
      url: 'https://api.botconnector.id',
      serverType: 'OpenAI',
    };
    mockedSearchStore.hasConsentedToSearch = true;
    mockedSearchStore.isProviderConfigured = false;
    (mockedServerStore.getApiKey as jest.Mock)
      .mockReset()
      .mockResolvedValue('bc_live_test');
  });

  it('selects BotConnector automatically for an active BotConnector model', () => {
    const access = createSearchAccess();

    expect(access.canSearch()).toBe(true);
    expect(access.getActiveProvider().id).toBe('botconnector');
  });

  it('keeps consent as a hard gate even with a BotConnector connection', () => {
    mockedSearchStore.hasConsentedToSearch = false;

    expect(createSearchAccess().canSearch()).toBe(false);
  });

  it('does not treat an arbitrary OpenAI-compatible server as BotConnector', () => {
    mockedModelStore.activeRemoteBinding = {
      modelId: 'server-other/model',
      serverId: 'server-other',
      remoteModelId: 'model',
      url: 'https://api.example.com',
      serverType: 'OpenAI',
    };

    expect(createSearchAccess().getActiveProvider().id).toBe('brave');
  });
});
