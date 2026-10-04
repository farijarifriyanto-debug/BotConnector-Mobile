import {resolveRichFeatureAccess} from '../mobileFeatureAccess';
import {ModelOrigin} from '../types';
import type {BotConnectorClientCapabilities} from '../../api/botconnectorAccess';

const model = (serverId?: string) =>
  ({
    id: serverId ? `${serverId}/model` : 'local-model',
    origin: serverId ? ModelOrigin.REMOTE : ModelOrigin.LOCAL,
    serverId,
  }) as any;

const fullAccess: BotConnectorClientCapabilities = {
  object: 'botconnector.client_capabilities',
  plan: 'plus',
  access: 'full',
  paid: true,
  entitlement_sources: {subscription: true, payg: false, family: false},
  capabilities: {
    chat: true,
    web_search: true,
    read_url: true,
    tools: true,
    vision: true,
    media: true,
  },
};

const chatOnly: BotConnectorClientCapabilities = {
  object: 'botconnector.client_capabilities',
  plan: 'starter',
  access: 'chat_only',
  paid: false,
  entitlement_sources: {subscription: false, payg: false, family: false},
  capabilities: {
    chat: true,
    web_search: false,
    read_url: false,
    tools: false,
    vision: false,
    media: false,
  },
};

describe('resolveRichFeatureAccess', () => {
  it('keeps on-device Local AI fully enabled', () => {
    expect(resolveRichFeatureAccess(model(), [], {})).toBe('full');
  });

  it('limits a public external OpenAI-compatible cloud server to chat only', () => {
    const servers = [
      {
        id: 'external',
        name: 'OpenAI',
        url: 'https://api.openai.com',
        serverType: 'OpenAI' as const,
      },
    ];
    expect(resolveRichFeatureAccess(model('external'), servers, {})).toBe(
      'chat_only',
    );
  });

  it('fails closed for BotConnector when account capability has not loaded', () => {
    const servers = [
      {
        id: 'bc',
        name: 'BotConnector',
        url: 'https://api.botconnector.id',
        serverType: 'OpenAI' as const,
      },
    ];
    expect(resolveRichFeatureAccess(model('bc'), servers, {})).toBe(
      'chat_only',
    );
  });

  it('keeps BotConnector starter/free accounts chat only', () => {
    const servers = [
      {
        id: 'bc',
        name: 'BotConnector',
        url: 'https://api.botconnector.id',
        serverType: 'OpenAI' as const,
      },
    ];
    expect(resolveRichFeatureAccess(model('bc'), servers, {bc: chatOnly})).toBe(
      'chat_only',
    );
  });

  it('enables rich features only when BotConnector backend confirms full access', () => {
    const servers = [
      {
        id: 'bc',
        name: 'BotConnector',
        url: 'https://api.botconnector.id',
        serverType: 'OpenAI' as const,
      },
    ];
    expect(
      resolveRichFeatureAccess(model('bc'), servers, {bc: fullAccess}),
    ).toBe('full');
  });

  it('keeps BotConnector Local full even over an optional Tailscale address', () => {
    const servers = [
      {
        id: 'local',
        name: 'BotConnector Local · laptop',
        url: 'http://100.100.1.20:1337',
        serverType: 'OpenAI' as const,
      },
    ];
    expect(resolveRichFeatureAccess(model('local'), servers, {})).toBe('full');
  });

  it.each(['llama.cpp', 'LM Studio', 'Ollama'] as const)(
    'keeps %s classed as Local AI even on a non-private hostname',
    serverType => {
      const servers = [
        {
          id: 'local-runtime',
          name: serverType,
          url: 'https://my-local-runtime.example',
          serverType,
        },
      ];
      expect(
        resolveRichFeatureAccess(model('local-runtime'), servers, {}),
      ).toBe('full');
    },
  );

  it('keeps a custom server on a private LAN address fully enabled', () => {
    const servers = [
      {
        id: 'lan',
        name: 'My vLLM',
        url: 'http://192.168.1.50:8000',
        serverType: 'vLLM' as const,
      },
    ];
    expect(resolveRichFeatureAccess(model('lan'), servers, {})).toBe('full');
  });
});
