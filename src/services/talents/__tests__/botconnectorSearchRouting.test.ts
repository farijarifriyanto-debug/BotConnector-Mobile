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
import {searchProviderStore} from '../../../store/SearchProviderStore';

describe('search routing after the Cloud removal', () => {
  const mockedModelStore = modelStore as typeof modelStore & {
    activeRemoteBinding?: any;
  };
  const mockedSearchStore =
    searchProviderStore as typeof searchProviderStore & {
      hasConsentedToSearch: boolean;
      isProviderConfigured: boolean;
    };

  beforeEach(() => {
    // A model served by the BotConnector BYOK preset: the user's own key, sent
    // straight to api.botconnector.id. Search must still use the user's own
    // search provider - 2.1.0 has no BotConnector-operated search.
    mockedModelStore.activeRemoteBinding = {
      modelId: 'server-bc/gpt-test',
      serverId: 'server-bc',
      remoteModelId: 'gpt-test',
      url: 'https://api.botconnector.id',
      serverType: 'OpenAI',
    };
    mockedSearchStore.hasConsentedToSearch = true;
    mockedSearchStore.isProviderConfigured = false;
  });

  it('uses the configured provider even for a BotConnector-preset model', () => {
    const access = createSearchAccess();

    expect(access.getActiveProvider().id).toBe('brave');
  });

  it('keeps consent as a hard gate', () => {
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
