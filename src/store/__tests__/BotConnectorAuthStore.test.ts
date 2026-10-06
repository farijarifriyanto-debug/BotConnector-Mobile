import {Linking} from 'react-native';
import * as Keychain from 'react-native-keychain';
import {sha256} from 'js-sha256';

jest.mock('react-native-get-random-values', () => ({}));

jest.mock('react-native-keychain', () => {
  const mem = new Map<string, {username: string; password: string}>();
  return {
    __mem: mem,
    setGenericPassword: jest.fn(
      async (username: string, password: string, opts: {service: string}) => {
        mem.set(opts.service, {username, password});
        return true;
      },
    ),
    getGenericPassword: jest.fn(async (opts: {service: string}) =>
      mem.has(opts.service) ? mem.get(opts.service) : false,
    ),
    resetGenericPassword: jest.fn(async (opts: {service: string}) => {
      mem.delete(opts.service);
      return true;
    }),
  };
});

const mockServers: any[] = [];
jest.mock('../ServerStore', () => ({
  serverStore: {
    get servers() {
      return mockServers;
    },
    addServer: jest.fn((cfg: any) => {
      mockServers.push({id: 'srv-bc', ...cfg});
      return 'srv-bc';
    }),
    updateServer: jest.fn(),
    setApiKey: jest.fn(async () => undefined),
    fetchModelsForServer: jest.fn(async () => undefined),
    removeServer: jest.fn((id: string) => {
      const i = mockServers.findIndex(s => s.id === id);
      if (i >= 0) {
        mockServers.splice(i, 1);
      }
    }),
  },
}));

jest.mock('../ModelStore', () => ({
  modelStore: {
    activeRemoteBinding: undefined,
    releaseContext: jest.fn(async () => undefined),
  },
}));

import {botConnectorAuthStore} from '../BotConnectorAuthStore';
import {serverStore} from '../ServerStore';
import {modelStore} from '../ModelStore';

const mockModelStore = modelStore as any;

const mem = (Keychain as any).__mem as Map<string, any>;
const AUTH_SERVICE = 'botconnector-native-auth-v1';
const PENDING_SERVICE = 'botconnector-native-login-pending-v1';

const b64url = (hex: string) =>
  Buffer.from(hex, 'hex')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const jsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

const EXCHANGE = {
  user_id: '11111111-2222-3333-4444-555555555555',
  session_token: 'sess-token',
  access_token: 'bc_live_mobile_abc',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};
const ACCOUNT = {
  user_id: EXCHANGE.user_id,
  email: 'user@example.invalid',
  display_name: 'Test User',
  created_at: 1,
  expires_at: EXCHANGE.expires_at,
  plan: 'plus',
  available_micros: 0,
  has_payg: false,
  plan_models: [],
  cloud: {limit_tokens_24h: 1, used_tokens_24h: 0, remaining_tokens_24h: 1},
};

let openedUrl = '';
let fetchMock: jest.Mock;

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: require('crypto').webcrypto,
    configurable: true,
  });
});

beforeEach(async () => {
  mem.clear();
  mockServers.length = 0;
  mockModelStore.activeRemoteBinding = undefined;
  jest.clearAllMocks();
  openedUrl = '';
  jest.spyOn(Linking, 'openURL').mockImplementation(async (url: string) => {
    openedUrl = url;
  });
  fetchMock = jest.fn();
  (globalThis as any).fetch = fetchMock;
  // reset observable state between tests
  (botConnectorAuthStore as any).account = null;
  (botConnectorAuthStore as any).hasStoredSession = false;
  (botConnectorAuthStore as any).isSigningIn = false;
  (botConnectorAuthStore as any).error = null;
  (botConnectorAuthStore as any).handledCallbacks.clear();
  (botConnectorAuthStore as any).callbacksInFlight.clear();
});

const startAndGetCallback = async (overrideState?: string) => {
  await botConnectorAuthStore.startLogin();
  const pending = JSON.parse(mem.get(PENDING_SERVICE).password);
  const callback = `botconnector://auth/callback?code=one-time-code&state=${
    overrideState ?? pending.state
  }`;
  return {pending, callback};
};

describe('BotConnectorAuthStore', () => {
  it('only recognises the registered callback URL', () => {
    const s = botConnectorAuthStore;
    expect(s.isAuthCallback('botconnector://auth/callback?code=x')).toBe(true);
    expect(s.isAuthCallback('botconnector://auth/other?code=x')).toBe(false);
    expect(s.isAuthCallback('botconnector://chat/callback')).toBe(false);
    expect(s.isAuthCallback('https://botconnector.id/auth/callback')).toBe(
      false,
    );
    expect(s.isAuthCallback('not a url')).toBe(false);
  });

  it('startLogin opens the central login with client, state and a valid S256 PKCE challenge', async () => {
    await botConnectorAuthStore.startLogin();
    const url = new URL(openedUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://botconnector.id/app-login/start',
    );
    const pending = JSON.parse(mem.get(PENDING_SERVICE).password);
    expect(url.searchParams.get('client_id')).toBe('botconnector-mobile');
    expect(url.searchParams.get('state')).toBe(pending.state);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const expected = b64url(sha256(pending.verifier).toString());
    expect(url.searchParams.get('code_challenge')).toBe(expected);
    expect(pending.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pending.state.length).toBeGreaterThanOrEqual(32);
    // no secret / api key is ever put in the URL
    expect(openedUrl).not.toMatch(/token|secret|api_?key/i);
  });

  it('exchanges the one-time code with verifier, stores the session in Keychain and installs the Cloud credential', async () => {
    const {pending, callback} = await startAndGetCallback();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, EXCHANGE))
      .mockResolvedValueOnce(jsonResponse(200, ACCOUNT));

    await botConnectorAuthStore.handleAuthCallback(callback);

    const [exchangeUrl, init] = fetchMock.mock.calls[0];
    expect(exchangeUrl).toBe(
      'https://botconnector.id/app-login/native/exchange',
    );
    expect(Object.keys(init.headers)).toEqual(['Content-Type']);
    expect(JSON.parse(init.body)).toEqual({
      code: 'one-time-code',
      state: pending.state,
      client_id: 'botconnector-mobile',
      code_verifier: pending.verifier,
    });
    expect(JSON.parse(mem.get(AUTH_SERVICE).password).accessToken).toBe(
      EXCHANGE.access_token,
    );
    expect(mem.has(PENDING_SERVICE)).toBe(false);
    expect(serverStore.setApiKey).toHaveBeenCalledWith(
      'srv-bc',
      EXCHANGE.access_token,
    );
    expect(serverStore.fetchModelsForServer).toHaveBeenCalledWith('srv-bc');
    expect(botConnectorAuthStore.isSignedIn).toBe(true);
    expect(botConnectorAuthStore.account?.plan).toBe('plus');
    expect(botConnectorAuthStore.account?.display_name).toBe('Test User');
    expect(botConnectorAuthStore.account?.email).toBe('user@example.invalid');
  });

  it('never exchanges the same code twice (concurrent and repeated delivery)', async () => {
    const {callback} = await startAndGetCallback();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, EXCHANGE))
      .mockResolvedValueOnce(jsonResponse(200, ACCOUNT));

    await Promise.all([
      botConnectorAuthStore.handleAuthCallback(callback),
      botConnectorAuthStore.handleAuthCallback(callback),
    ]);
    await botConnectorAuthStore.handleAuthCallback(callback);

    const exchanges = fetchMock.mock.calls.filter(([u]) =>
      String(u).endsWith('/native/exchange'),
    );
    expect(exchanges).toHaveLength(1);
  });

  it('rejects a callback whose state does not match and does not call the server', async () => {
    const {callback} = await startAndGetCallback('attacker-state');
    await expect(
      botConnectorAuthStore.handleAuthCallback(callback),
    ).rejects.toThrow(/invalid or expired/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mem.has(AUTH_SERVICE)).toBe(false);
  });

  it('abandoning the browser login does not leave the button stuck (can start again)', async () => {
    await botConnectorAuthStore.startLogin();
    expect(botConnectorAuthStore.isSigningIn).toBe(false);
    const first = openedUrl;
    await botConnectorAuthStore.startLogin();
    expect(openedUrl).not.toBe(first); // a fresh state/PKCE pair each time
  });

  it('rejects a callback when there is no pending login', async () => {
    await expect(
      botConnectorAuthStore.handleAuthCallback(
        'botconnector://auth/callback?code=c&state=s',
      ),
    ).rejects.toThrow(/invalid or expired/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a callback after the pending login expired (10 min)', async () => {
    const {pending, callback} = await startAndGetCallback();
    mem.set(PENDING_SERVICE, {
      username: 'pkce',
      password: JSON.stringify({
        ...pending,
        createdAt: Date.now() - 11 * 60 * 1000,
      }),
    });
    await expect(
      botConnectorAuthStore.handleAuthCallback(callback),
    ).rejects.toThrow(/invalid or expired/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('restore: a valid session is resolved and the Cloud credential reinstalled', async () => {
    mem.set(AUTH_SERVICE, {
      username: 'session',
      password: JSON.stringify({
        sessionToken: 'sess-token',
        accessToken: EXCHANGE.access_token,
        userId: EXCHANGE.user_id,
        expiresAt: EXCHANGE.expires_at,
      }),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ACCOUNT));

    await botConnectorAuthStore.restore();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://botconnector.id/app-login/native/session');
    expect(init.headers.Authorization).toBe('Bearer sess-token');
    expect(botConnectorAuthStore.account?.plan).toBe('plus');
    expect(serverStore.setApiKey).toHaveBeenCalledWith(
      'srv-bc',
      EXCHANGE.access_token,
    );
  });

  it('restore: 401 clears Keychain and every local Cloud trace, signed out', async () => {
    mem.set(AUTH_SERVICE, {
      username: 'session',
      password: JSON.stringify({
        sessionToken: 'dead',
        accessToken: 'bc_live_mobile_dead',
        userId: EXCHANGE.user_id,
        expiresAt: EXCHANGE.expires_at,
      }),
    });
    mockServers.push({id: 'srv-bc', url: 'https://api.botconnector.id'});
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {detail: 'nope'}));

    await botConnectorAuthStore.restore();

    expect(mem.has(AUTH_SERVICE)).toBe(false);
    expect(serverStore.removeServer).toHaveBeenCalledWith('srv-bc');
    expect(botConnectorAuthStore.isSignedIn).toBe(false);
    expect(botConnectorAuthStore.account).toBeNull();
  });

  it('restore: an expired stored session is dropped without calling the server', async () => {
    mem.set(AUTH_SERVICE, {
      username: 'session',
      password: JSON.stringify({
        sessionToken: 's',
        accessToken: 'bc_live_mobile_x',
        userId: EXCHANGE.user_id,
        expiresAt: Math.floor(Date.now() / 1000) - 5,
      }),
    });
    await botConnectorAuthStore.restore();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mem.has(AUTH_SERVICE)).toBe(false);
  });

  it('restore: a network failure keeps the credential (still signed in, error surfaced)', async () => {
    mem.set(AUTH_SERVICE, {
      username: 'session',
      password: JSON.stringify({
        sessionToken: 's',
        accessToken: 'bc_live_mobile_x',
        userId: EXCHANGE.user_id,
        expiresAt: EXCHANGE.expires_at,
      }),
    });
    fetchMock.mockRejectedValueOnce(new Error('Network request failed'));
    await botConnectorAuthStore.restore();
    expect(mem.has(AUTH_SERVICE)).toBe(true);
    expect(botConnectorAuthStore.isSignedIn).toBe(true);
    expect(botConnectorAuthStore.error).toMatch(/network/i);
  });

  it('revalidate: signs out when the session was revoked while the app stayed open', async () => {
    mem.set(AUTH_SERVICE, {
      username: 'session',
      password: JSON.stringify({
        sessionToken: 'sess-token',
        accessToken: EXCHANGE.access_token,
        userId: EXCHANGE.user_id,
        expiresAt: EXCHANGE.expires_at,
      }),
    });
    (botConnectorAuthStore as any).hasStoredSession = true;
    (botConnectorAuthStore as any).lastResolvedAt = 0;
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {detail: 'revoked'}));

    await botConnectorAuthStore.revalidate();

    expect(mem.has(AUTH_SERVICE)).toBe(false);
    expect(botConnectorAuthStore.isSignedIn).toBe(false);
  });

  it('revalidate: is throttled and ignores an offline error', async () => {
    mem.set(AUTH_SERVICE, {
      username: 'session',
      password: JSON.stringify({
        sessionToken: 'sess-token',
        accessToken: EXCHANGE.access_token,
        userId: EXCHANGE.user_id,
        expiresAt: EXCHANGE.expires_at,
      }),
    });
    (botConnectorAuthStore as any).hasStoredSession = true;
    (botConnectorAuthStore as any).lastResolvedAt = Date.now();
    await botConnectorAuthStore.revalidate();
    expect(fetchMock).not.toHaveBeenCalled(); // checked recently

    (botConnectorAuthStore as any).lastResolvedAt = 0;
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await botConnectorAuthStore.revalidate();
    expect(mem.has(AUTH_SERVICE)).toBe(true);
    expect(botConnectorAuthStore.isSignedIn).toBe(true);
  });

  it('logout revokes server-side, clears Keychain, releases an active Cloud model and removes the Cloud server', async () => {
    mem.set(AUTH_SERVICE, {
      username: 'session',
      password: JSON.stringify({
        sessionToken: 'sess-token',
        accessToken: EXCHANGE.access_token,
        userId: EXCHANGE.user_id,
        expiresAt: EXCHANGE.expires_at,
      }),
    });
    mockServers.push({id: 'srv-bc', url: 'https://api.botconnector.id'});
    mockModelStore.activeRemoteBinding = {serverId: 'srv-bc'};
    fetchMock.mockResolvedValueOnce(jsonResponse(204, null));

    await botConnectorAuthStore.logout();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://botconnector.id/app-login/native/logout');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sess-token');
    expect(mem.has(AUTH_SERVICE)).toBe(false);
    expect(mockModelStore.releaseContext).toHaveBeenCalledWith(true);
    expect(serverStore.removeServer).toHaveBeenCalledWith('srv-bc');
    expect(botConnectorAuthStore.isSignedIn).toBe(false);
  });

  it('logout still wipes local credentials when the revoke request fails', async () => {
    mem.set(AUTH_SERVICE, {
      username: 'session',
      password: JSON.stringify({
        sessionToken: 'sess-token',
        accessToken: EXCHANGE.access_token,
        userId: EXCHANGE.user_id,
        expiresAt: EXCHANGE.expires_at,
      }),
    });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await botConnectorAuthStore.logout();
    expect(mem.has(AUTH_SERVICE)).toBe(false);
    expect(botConnectorAuthStore.isSignedIn).toBe(false);
  });
});
