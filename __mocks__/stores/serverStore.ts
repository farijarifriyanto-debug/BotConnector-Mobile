import {makeAutoObservable, observable} from 'mobx';

import {
  RemoteModelCaps,
  RemoteModelInfo,
  ServerConfig,
} from '../../src/utils/types';
import {ReasoningCapability} from '../../src/utils/reasoningCapability';
import {deriveListCapsMap} from '../../src/api/servers';
import {isBotConnectorApiUrl} from '../../src/config/botconnector';
import {catalogSupportsVision} from '../../src/utils/botconnectorModels';

class MockServerStore {
  servers: ServerConfig[] = [];
  serverModels: Map<string, RemoteModelInfo[]> = observable.map();

  // Mirrors the real ServerStore.listCaps: the derived map plus the
  // BotConnector catalog vision merge, so suites exercising catalog-driven
  // vision run against the same derivation the app ships with.
  get listCaps() {
    const map = deriveListCapsMap(this.servers, this.serverModels);
    for (const server of this.servers) {
      if (!isBotConnectorApiUrl(server.url)) {
        continue;
      }
      for (const row of this.serverModels.get(server.id) ?? []) {
        const vision = catalogSupportsVision(row, this.botConnectorCatalog);
        if (vision !== undefined) {
          const key = `${server.id}/${row.id}`;
          map[key] = {
            ...(map[key] ?? {tier: 'list'}),
            supportsVision: vision,
            authoritative: true,
          };
        }
      }
    }
    return map;
  }

  botConnectorAccess: Record<string, any> = {};
  botConnectorAccessState: Record<
    string,
    {loading: boolean; error: boolean; errorKind?: string}
  > = {};
  botConnectorCatalog: Record<string, any> = {};

  /** Same derivation as the real store: first payload that carried `payg`. */
  get botConnectorPayg(): any {
    for (const caps of Object.values(this.botConnectorAccess)) {
      if (caps && caps.payg) {
        return caps.payg;
      }
    }
    return undefined;
  }

  isBotConnectorServer(serverId: string | undefined): boolean {
    const server = this.servers.find(s => s.id === serverId);
    return !!server && server.url.startsWith('https://api.botconnector.id');
  }

  cloudModelsForServer(_serverId: string): any[] {
    return [];
  }

  remoteDisplayName(_serverId: string, remoteModelId: string): string {
    return remoteModelId;
  }

  userSelectedModels: Array<{serverId: string; remoteModelId: string}> = [];
  remoteReasoning: Record<string, ReasoningCapability> = {};
  remoteCaps: Record<string, RemoteModelCaps> = {};
  isLoading = false;
  error: string | null = null;
  privacyNoticeAcknowledged = false;

  addServer: jest.Mock;
  updateServer: jest.Mock;
  removeServer: jest.Mock;
  setApiKey: jest.Mock;
  getApiKey: jest.Mock;
  removeApiKey: jest.Mock;
  fetchModelsForServer: jest.Mock;
  fetchRemoteModelCaps: jest.Mock;
  fetchAllRemoteModels: jest.Mock;
  testServerConnection: jest.Mock;
  acknowledgePrivacyNotice: jest.Mock;
  addUserSelectedModel: jest.Mock;
  removeUserSelectedModel: jest.Mock;
  removeServerIfOrphaned: jest.Mock;
  getModelsNotYetAdded: jest.Mock;
  getUserSelectedModelsForServer: jest.Mock;
  recordRemoteReasoningObserved: jest.Mock;
  setRemoteReasoningOverride: jest.Mock;
  refreshBotConnectorCatalog: jest.Mock;
  refreshBotConnectorAccess: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      addServer: false,
      updateServer: false,
      removeServer: false,
      setApiKey: false,
      getApiKey: false,
      removeApiKey: false,
      fetchModelsForServer: false,
      fetchRemoteModelCaps: false,
      fetchAllRemoteModels: false,
      testServerConnection: false,
      acknowledgePrivacyNotice: false,
      addUserSelectedModel: false,
      removeUserSelectedModel: false,
      removeServerIfOrphaned: false,
      getModelsNotYetAdded: false,
      getUserSelectedModelsForServer: false,
      recordRemoteReasoningObserved: false,
      setRemoteReasoningOverride: false,
      refreshBotConnectorCatalog: false,
      refreshBotConnectorAccess: false,
    });
    this.addServer = jest.fn().mockReturnValue('mock-server-id');
    this.updateServer = jest.fn().mockReturnValue(false);
    this.removeServer = jest.fn();
    this.setApiKey = jest.fn().mockResolvedValue(undefined);
    this.getApiKey = jest.fn().mockResolvedValue(undefined);
    this.removeApiKey = jest.fn().mockResolvedValue(undefined);
    this.fetchModelsForServer = jest.fn().mockResolvedValue(undefined);
    this.fetchRemoteModelCaps = jest.fn().mockResolvedValue(undefined);
    this.fetchAllRemoteModels = jest.fn().mockResolvedValue(undefined);
    this.testServerConnection = jest
      .fn()
      .mockResolvedValue({ok: true, modelCount: 3});
    this.acknowledgePrivacyNotice = jest.fn();
    this.addUserSelectedModel = jest.fn();
    this.removeUserSelectedModel = jest.fn();
    this.removeServerIfOrphaned = jest.fn();
    this.getModelsNotYetAdded = jest.fn().mockReturnValue([]);
    this.getUserSelectedModelsForServer = jest.fn().mockReturnValue([]);
    this.recordRemoteReasoningObserved = jest.fn();
    this.setRemoteReasoningOverride = jest.fn();
    this.refreshBotConnectorCatalog = jest.fn().mockResolvedValue(undefined);
    this.refreshBotConnectorAccess = jest.fn().mockResolvedValue(undefined);
  }
}

export const mockServerStore = new MockServerStore();
