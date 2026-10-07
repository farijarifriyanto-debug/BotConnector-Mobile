import {
  BotConnectorCapabilityError,
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

  it('accepts a payload without the legacy access/paid flags', async () => {
    // Contract: access/paid are compatibility-only; the independent
    // per-axis capabilities are what gating reads.
    const payload = {
      object: 'botconnector.client_capabilities',
      plan: 'starter',
      capabilities: {
        chat: true,
        web_search: true,
        read_url: true,
        tools: true,
        vision: true,
        media: true,
        files: false,
      },
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as any);

    await expect(
      fetchBotConnectorClientCapabilities(
        'https://api.botconnector.id',
        'bc_live_test',
      ),
    ).resolves.toEqual(payload);
  });

  it('passes through reasons, the per-axis capability_scope map and payg', async () => {
    const payload = {
      object: 'botconnector.client_capabilities',
      plan: 'starter',
      capability_scope: {chat: 'quota', files: 'plan', vision: 'model'},
      reasons: {files: 'paid_plan_required'},
      payg: {state: 'active', available_micros: 5_000_000},
      capabilities: {
        chat: true,
        web_search: true,
        read_url: true,
        tools: true,
        vision: true,
        media: true,
        files: false,
      },
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as any);

    const result = await fetchBotConnectorClientCapabilities(
      'https://api.botconnector.id',
      'bc_live_test',
    );
    expect(result.reasons?.files).toBe('paid_plan_required');
    // Contract: the server sends a per-axis map (Record<axis, scope>), never
    // a single scope string. The typed binding below must keep compiling.
    const scope: Record<string, 'quota' | 'model' | 'plan'> =
      result.capability_scope ?? {};
    expect(scope).toEqual({chat: 'quota', files: 'plan', vision: 'model'});
    expect(result.payg).toEqual({state: 'active', available_micros: 5_000_000});
  });

  it.each([
    [429, 'quota_rate_limited'],
    [402, 'quota_balance'],
    [500, 'server'],
  ])(
    'classifies a %s capability failure as %s',
    async (status: number, kind: string) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => ({}),
      } as any);

      const error = await fetchBotConnectorClientCapabilities(
        'https://api.botconnector.id',
        'bc_live_test',
      ).catch(e => e);
      expect(error).toBeInstanceOf(BotConnectorCapabilityError);
      expect(error.kind).toBe(kind);
      expect(error.statusCode).toBe(status);
    },
  );
});
