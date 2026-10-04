import {
  chatOnlyBotConnectorCapabilities,
  fetchBotConnectorClientCapabilities,
} from '../botconnectorAccess';

describe('BotConnector client capabilities API', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns a validated full-access response', async () => {
    const payload = {
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
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as any);

    await expect(
      fetchBotConnectorClientCapabilities(
        'https://api.botconnector.id/',
        'bc_live_test',
      ),
    ).resolves.toEqual(payload);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.botconnector.id/v1/client/capabilities',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer bc_live_test',
        }),
      }),
    );
  });

  it('rejects an invalid capability response instead of failing open', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({access: 'full'}),
    } as any);

    await expect(
      fetchBotConnectorClientCapabilities(
        'https://api.botconnector.id',
        'bc_live_test',
      ),
    ).rejects.toThrow('Invalid BotConnector capabilities response');
  });

  it('rejects a failed entitlement request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as any);

    await expect(
      fetchBotConnectorClientCapabilities(
        'https://api.botconnector.id',
        'bc_live_test',
      ),
    ).rejects.toThrow('BotConnector capabilities request failed (403)');
  });

  it('builds a deterministic chat-only fallback', () => {
    expect(chatOnlyBotConnectorCapabilities('starter')).toMatchObject({
      plan: 'starter',
      access: 'chat_only',
      paid: false,
      capabilities: {
        chat: true,
        web_search: false,
        tools: false,
        vision: false,
      },
    });
  });
});
