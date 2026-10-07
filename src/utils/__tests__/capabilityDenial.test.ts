import {BotConnectorClientCapabilities} from '../../api/botconnectorAccess';
import {resolveCapabilityDenial} from '../capabilityDenial';

const access = (
  overrides: Partial<BotConnectorClientCapabilities> = {},
): BotConnectorClientCapabilities => ({
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
    files: true,
  },
  ...overrides,
});

const base = {
  enabled: false,
  isBotConnectorServer: true,
  isSignedIn: true,
  modelSupports: true,
  capability: 'vision' as const,
};

describe('resolveCapabilityDenial', () => {
  it('returns null when the capability is available', () => {
    expect(
      resolveCapabilityDenial({...base, enabled: true, access: undefined}),
    ).toBeNull();
  });

  it('blames the model when it does not support the axis', () => {
    expect(
      resolveCapabilityDenial({
        ...base,
        modelSupports: false,
        access: undefined,
      }),
    ).toBe('model_unsupported');
  });

  it('keeps the legacy model explanation for non-official servers', () => {
    expect(
      resolveCapabilityDenial({
        ...base,
        isBotConnectorServer: false,
        access: undefined,
      }),
    ).toBe('model_unsupported');
  });

  it('asks the user to sign in before anything else on official servers', () => {
    expect(
      resolveCapabilityDenial({...base, isSignedIn: false, access: undefined}),
    ).toBe('signed_out');
  });

  it('reports checking while capabilities are loading or missing', () => {
    expect(resolveCapabilityDenial({...base, access: undefined})).toBe(
      'checking',
    );
    expect(
      resolveCapabilityDenial({
        ...base,
        access: access(),
        accessLoading: true,
      }),
    ).toBe('checking');
  });

  it('reports unavailable when the last lookup failed or never verified', () => {
    expect(
      resolveCapabilityDenial({
        ...base,
        access: access(),
        accessError: true,
      }),
    ).toBe('unavailable');
    // A failed refresh with no cached capabilities is still a failed check,
    // not something still in progress.
    expect(
      resolveCapabilityDenial({
        ...base,
        access: undefined,
        accessError: true,
      }),
    ).toBe('unavailable');
    expect(
      resolveCapabilityDenial({
        ...base,
        access: access({plan: 'unknown', access: 'chat_only', paid: false}),
      }),
    ).toBe('unavailable');
    // A generic backend failure keeps the plain unavailable answer.
    expect(
      resolveCapabilityDenial({
        ...base,
        access: undefined,
        accessError: true,
        accessErrorKind: 'server',
      }),
    ).toBe('unavailable');
  });

  it('separates quota refusals from backend failures', () => {
    // 429: rate/quota window — its own message, never the model's fault.
    expect(
      resolveCapabilityDenial({
        ...base,
        accessError: true,
        accessErrorKind: 'quota_rate_limited',
      }),
    ).toBe('quota_rate_limited');
    // 402: balance/quota plan — again not a backend outage.
    expect(
      resolveCapabilityDenial({
        ...base,
        accessError: true,
        accessErrorKind: 'quota_balance',
      }),
    ).toBe('quota_balance');
    // Quota answers still precede plan/model checks: axis enabled must win
    // (no error recorded when the capability came back fine).
    expect(
      resolveCapabilityDenial({
        ...base,
        enabled: true,
        accessError: true,
        accessErrorKind: 'quota_rate_limited',
      }),
    ).toBeNull();
  });

  it('separates a plan denial from a model limitation', () => {
    expect(
      resolveCapabilityDenial({
        ...base,
        access: access({
          access: 'chat_only',
          capabilities: {
            chat: true,
            web_search: false,
            read_url: false,
            tools: false,
            vision: false,
            media: false,
            files: false,
          },
        }),
      }),
    ).toBe('plan_not_included');
  });

  it('does not block when account and model both allow the axis', () => {
    expect(resolveCapabilityDenial({...base, access: access()})).toBeNull();
  });

  it('reads each axis independently (Starter Web Search vs Files)', () => {
    const partial = access({
      access: 'chat_only',
      capabilities: {
        chat: true,
        web_search: true,
        read_url: true,
        tools: false,
        vision: false,
        media: false,
        files: false,
      },
    });
    expect(
      resolveCapabilityDenial({
        ...base,
        capability: 'web_search',
        access: partial,
      }),
    ).toBeNull();
    expect(
      resolveCapabilityDenial({...base, capability: 'files', access: partial}),
    ).toBe('plan_not_included');
  });
});
