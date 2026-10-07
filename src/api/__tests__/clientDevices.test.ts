/**
 * Local-devices contract (spec item 4): the mobile app is the client of
 * /v1/client/devices. Auth is the NATIVE session token only — API keys are
 * rejected by the server (403 device_access_requires_app_login) and must never
 * be sent from here. The method whitelist is enforced client-side: this app
 * never offers install/pull/delete of any kind.
 */
import * as Keychain from 'react-native-keychain';

import {
  CLIENT_DEVICE_ALLOWED_METHODS,
  ClientDeviceError,
  assertClientDeviceMethod,
  createClientDeviceSseParser,
  getClientDeviceSessionToken,
  listClientDevices,
  pairClientDevice,
  parseRetryAfterSeconds,
  requestClientDevice,
  revokeClientDevice,
  streamClientDeviceChat,
} from '../clientDevices';

const BASE = 'https://api.botconnector.id/v1/client/devices';
const SESSION_TOKEN = 'sess-native-abc';

const jsonResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
  }) as any;

const signInKeychain = () => {
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
    username: 'session',
    password: JSON.stringify({
      sessionToken: SESSION_TOKEN,
      accessToken: 'access-token-never-used-here',
      userId: 'usr_1',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }),
  });
};

describe('client devices API', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    signInKeychain();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('listClientDevices', () => {
    const device = {
      id: 'dev-1',
      name: 'Workstation',
      platform: 'linux',
      arch: 'x64',
      online: true,
      capabilities: ['chat.completions'],
      hardware: {cpu: 'Ryzen'},
      last_seen: '2026-10-07T10:00:00Z',
    };

    it('GETs /v1/client/devices with the native session token', async () => {
      const payload = {object: 'list', data: [device]};
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, payload));

      await expect(listClientDevices()).resolves.toEqual(payload);

      expect(global.fetch).toHaveBeenCalledWith(`${BASE}`, {
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${SESSION_TOKEN}`,
        }),
        signal: expect.anything(),
      });
    });

    it('rejects a payload that is not a device list', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(200, {object: 'something_else', data: []}),
      );

      await expect(listClientDevices()).rejects.toThrow(/invalid/i);
    });

    it('fails with requires_app_login instead of falling back to an API key', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(null);

      const error = await listClientDevices().catch(e => e);

      expect(error).toBeInstanceOf(ClientDeviceError);
      expect(error.kind).toBe('requires_app_login');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('pairClientDevice', () => {
    it('POSTs /pair and normalises the expiry to epoch ms', async () => {
      const expiresSeconds = 1_760_000_000;
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(200, {code: 'PAIR1234', expires_at: expiresSeconds}),
      );

      const result = await pairClientDevice();

      expect(global.fetch).toHaveBeenCalledWith(`${BASE}/pair`, {
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        }),
        body: expect.any(String),
        signal: expect.anything(),
      });
      expect(result.code).toBe('PAIR1234');
      expect(result.expiresAt).toBe(expiresSeconds * 1000);
    });

    it('accepts an ISO-8601 expires_at', async () => {
      const iso = '2026-10-07T10:05:00Z';
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(200, {code: 'ABCDABCD', expires_at: iso}),
      );

      const result = await pairClientDevice();

      expect(result.code).toBe('ABCDABCD');
      expect(result.expiresAt).toBe(Date.parse(iso));
    });

    it('maps 429 pair_rate_limited to rate_limited with Retry-After seconds', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(429, {code: 'pair_rate_limited'}, {'retry-after': '42'}),
      );

      const error = await pairClientDevice().catch(e => e);

      expect(error).toBeInstanceOf(ClientDeviceError);
      expect(error.kind).toBe('rate_limited');
      expect(error.retryAfterSeconds).toBe(42);
    });
  });

  describe('requestClientDevice', () => {
    it('POSTs {method, params} to /{id}/request', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(200, {cores: 8}),
      );

      const result = await requestClientDevice({
        deviceId: 'dev-1',
        method: 'hardware.get',
        params: {detail: 'full'},
      });

      expect(result).toEqual({cores: 8});
      expect(global.fetch).toHaveBeenCalledWith(`${BASE}/dev-1/request`, {
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          method: 'hardware.get',
          params: {detail: 'full'},
        }),
        signal: expect.anything(),
      });
    });

    it.each([
      'device.install',
      'models.pull',
      'models.delete',
      'files.delete',
      'model.download',
      'system.shell',
    ])('refuses %s before any request leaves the device', async method => {
      const error = await requestClientDevice({
        deviceId: 'dev-1',
        method: method as any,
        params: {},
      }).catch(e => e);

      expect(error).toBeInstanceOf(ClientDeviceError);
      expect(error.kind).toBe('method_not_allowed');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('revokeClientDevice', () => {
    it('POSTs /{id}/revoke', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(200, {revoked: true}),
      );

      await expect(revokeClientDevice({deviceId: 'dev-9'})).resolves.toEqual({
        revoked: true,
      });
      expect(global.fetch).toHaveBeenCalledWith(`${BASE}/dev-9/revoke`, {
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${SESSION_TOKEN}`,
          'Content-Type': 'application/json',
        }),
        body: expect.any(String),
        signal: expect.anything(),
      });
    });
  });

  describe('error kind mapping', () => {
    it.each<[number, Record<string, unknown>, string]>([
      [409, {}, 'device_offline'],
      [403, {code: 'device_method_not_allowed'}, 'method_not_allowed'],
      [403, {}, 'method_not_allowed'],
      [503, {}, 'relay_unavailable'],
      [504, {}, 'device_timeout'],
    ])('maps %i %j to %s', async (status, body, kind) => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(status, body));

      const error = await listClientDevices().catch(e => e);

      expect(error).toBeInstanceOf(ClientDeviceError);
      expect(error.kind).toBe(kind);
      expect(error.statusCode).toBe(status);
    });

    it('maps 403 device_access_requires_app_login (API-key auth) to requires_app_login', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(403, {code: 'device_access_requires_app_login'}),
      );

      const error = await listClientDevices().catch(e => e);

      expect(error).toBeInstanceOf(ClientDeviceError);
      expect(error.kind).toBe('requires_app_login');
      expect(error.statusCode).toBe(403);
    });

    it('maps anything else to server', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(418, {detail: 'teapot'}),
      );

      const error = await listClientDevices().catch(e => e);

      expect(error.kind).toBe('server');
      expect(error.statusCode).toBe(418);
    });
  });

  describe('parseRetryAfterSeconds', () => {
    it('reads a delta-seconds value', () => {
      expect(parseRetryAfterSeconds('42')).toBe(42);
    });

    it('returns undefined for a missing header', () => {
      expect(parseRetryAfterSeconds(null)).toBeUndefined();
      expect(parseRetryAfterSeconds(undefined)).toBeUndefined();
      expect(parseRetryAfterSeconds('')).toBeUndefined();
    });

    it('falls back to an HTTP-date', () => {
      const target = Date.now() + 90_000;
      const header = new Date(target).toUTCString();
      const parsed = parseRetryAfterSeconds(header);
      expect(parsed).toBeGreaterThanOrEqual(85);
      expect(parsed).toBeLessThanOrEqual(91);
    });
  });

  describe('whitelist', () => {
    it('contains exactly the contract methods', () => {
      expect([...CLIENT_DEVICE_ALLOWED_METHODS]).toEqual([
        'hardware.get',
        'runtime.status',
        'models.list',
        'model.load',
        'model.unload',
        'chat.completions',
        'chat.cancel',
      ]);
    });

    it('assertClientDeviceMethod throws for a non-whitelisted method', () => {
      expect(() => assertClientDeviceMethod('model.pull')).toThrow(
        ClientDeviceError,
      );
      expect(() => assertClientDeviceMethod('hardware.get')).not.toThrow();
    });
  });

  describe('SSE parser helper', () => {
    it('parses events split across chunks and signals done', () => {
      const events: Array<object | 'done'> = [];
      const parser = createClientDeviceSseParser(e => events.push(e));

      parser.feed('data: {"choices":[{"delta":{"content":"He');
      parser.feed('llo"}}]}\n\ndata: {"choices":[{"delta":');
      parser.feed('{"content":"!"}}]}\n\n');
      parser.feed('data: [DONE]\n\n');

      expect(events).toEqual([
        {choices: [{delta: {content: 'Hello'}}]},
        {choices: [{delta: {content: '!'}}]},
        'done',
      ]);
    });

    it('flush leaves no partial line behind', () => {
      const events: Array<object | 'done'> = [];
      const parser = createClientDeviceSseParser(e => events.push(e));

      parser.feed('data: {"a":1}');
      expect(events).toEqual([]);
      parser.flush();
      expect(events).toEqual([{a: 1}]);
      parser.flush();
      expect(events).toHaveLength(1);
    });
  });

  describe('streamClientDeviceChat', () => {
    class FakeXHR {
      static last: FakeXHR;
      body = '';
      status = 0;
      responseText = '';
      requestHeaders: Record<string, string> = {};
      openedWith: {method: string; url: string} | null = null;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        FakeXHR.last = this;
      }
      open(method: string, url: string) {
        this.openedWith = {method, url};
      }
      setRequestHeader(key: string, value: string) {
        this.requestHeaders[key] = value;
      }
      send(body?: string) {
        this.body = body ?? '';
      }
      abort() {}
      getAllResponseHeaders() {
        return '';
      }
    }

    let realXHR: typeof XMLHttpRequest;

    // The session token resolves asynchronously, so the XHR only exists after
    // the first microtask turns.
    const flushed = () => new Promise(resolve => setTimeout(resolve, 0));

    beforeEach(() => {
      realXHR = global.XMLHttpRequest;
      (global as any).XMLHttpRequest = FakeXHR;
    });

    afterEach(() => {
      global.XMLHttpRequest = realXHR;
    });

    it('POSTs chat.completions to /{id}/stream with the session token and yields SSE events', async () => {
      const events: object[] = [];
      const pending = streamClientDeviceChat({
        deviceId: 'dev-1',
        params: {
          model: 'local-llama',
          messages: [{role: 'user', content: 'hi'}],
        },
        onEvent: e => events.push(e),
      });
      await flushed();

      const xhr = FakeXHR.last;
      expect(xhr.openedWith).toEqual({
        method: 'POST',
        url: `${BASE}/dev-1/stream`,
      });
      expect(xhr.requestHeaders.Authorization).toBe(`Bearer ${SESSION_TOKEN}`);
      const body = JSON.parse(xhr.body);
      expect(body.method).toBe('chat.completions');
      expect(body.params.model).toBe('local-llama');

      xhr.responseText = 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n';
      xhr.onprogress?.();
      xhr.responseText += 'data: [DONE]\n\n';
      xhr.onprogress?.();
      xhr.status = 200;
      xhr.onload?.();

      await expect(pending).resolves.toBeUndefined();
      expect(events).toEqual([{choices: [{delta: {content: 'Hi'}}]}]);
    });

    it('maps a non-200 stream handshake to a typed error', async () => {
      const pending = streamClientDeviceChat({
        deviceId: 'dev-1',
        params: {},
      }).catch(e => e);
      await flushed();

      const xhr = FakeXHR.last;
      xhr.status = 409;
      xhr.responseText = '{}';
      xhr.onload?.();

      const error = await pending;
      expect(error).toBeInstanceOf(ClientDeviceError);
      expect(error.kind).toBe('device_offline');
    });
  });

  describe('getClientDeviceSessionToken', () => {
    it('reads the same Keychain entry the auth store writes', async () => {
      await expect(getClientDeviceSessionToken()).resolves.toBe(SESSION_TOKEN);
      expect(Keychain.getGenericPassword).toHaveBeenCalledWith({
        service: 'botconnector-native-auth-v1',
      });
    });

    it('never mutates stored credentials', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        password: 'not-json',
      });

      await expect(getClientDeviceSessionToken()).resolves.toBeNull();
      expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();
      expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
    });

    it('treats an expired session as absent', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        password: JSON.stringify({
          sessionToken: 'stale',
          expiresAt: Math.floor(Date.now() / 1000) - 60,
        }),
      });

      await expect(getClientDeviceSessionToken()).resolves.toBeNull();
    });
  });
});
