/**
 * Local-devices contract (spec item 4): the mobile app pairs with BotConnector
 * Desktop / a device CLI and may only call the whitelisted device methods
 * below. Auth is the `accessToken` (bc_live_mobile_…) from the same Keychain
 * entry BotConnectorAuthStore writes (`botconnector-native-auth-v1`); that
 * entry's sessionToken is rejected by the server (401 invalid_api_key) and an
 * ordinary API key gets 403 device_access_requires_app_login, so neither is
 * ever sent. Install/pull/delete of any kind is not part of the whitelist and
 * is refused client-side before any request leaves the device.
 */
import * as Keychain from 'react-native-keychain';

import {BOTCONNECTOR_API_BASE_URL} from '../config/botconnector';
import {CONNECTION_TIMEOUT_MS} from './http';
import {SSEParser} from './sseParser';

const DEVICES_URL = `${BOTCONNECTOR_API_BASE_URL}/v1/client/devices`;

// Must match the Keychain service BotConnectorAuthStore writes; reading it
// directly avoids touching the auth store (READ-ONLY requirement).
const AUTH_KEYCHAIN_SERVICE = 'botconnector-native-auth-v1';

// Contract: mobile may only call these. Never install/pull/delete anything.
export const CLIENT_DEVICE_ALLOWED_METHODS = [
  'hardware.get',
  'runtime.status',
  'models.list',
  'model.load',
  'model.unload',
  'chat.completions',
  'chat.cancel',
] as const;

export type ClientDeviceMethod = (typeof CLIENT_DEVICE_ALLOWED_METHODS)[number];

export type ClientDeviceErrorKind =
  | 'device_offline'
  | 'method_not_allowed'
  | 'requires_app_login'
  | 'relay_unavailable'
  | 'device_timeout'
  | 'rate_limited'
  | 'server';

export class ClientDeviceError extends Error {
  readonly kind: ClientDeviceErrorKind;
  readonly statusCode?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    kind: ClientDeviceErrorKind,
    message: string,
    options?: {statusCode?: number; retryAfterSeconds?: number},
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ClientDeviceError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export interface ClientDevice {
  id: string;
  name: string;
  platform: string;
  arch: string;
  online: boolean;
  capabilities?: unknown;
  hardware?: Record<string, unknown> | null;
  last_seen?: string | number | null;
}

export interface ClientDeviceListPayload {
  object: 'list';
  data: ClientDevice[];
}

export interface ClientDevicePairResult {
  code: string;
  /** Epoch milliseconds after which the code is unusable. */
  expiresAt: number;
}

/** Client-side guard: anything outside the whitelist is refused locally. */
export function assertClientDeviceMethod(method: string): void {
  if (!(CLIENT_DEVICE_ALLOWED_METHODS as readonly string[]).includes(method)) {
    throw new ClientDeviceError(
      'method_not_allowed',
      `Method "${method}" is not allowed for client devices.`,
    );
  }
}

export function isClientDeviceMethodAllowed(
  method: string,
): method is ClientDeviceMethod {
  return (CLIENT_DEVICE_ALLOWED_METHODS as readonly string[]).includes(method);
}

/** Parses a Retry-After header: delta-seconds first, HTTP-date as fallback. */
export function parseRetryAfterSeconds(
  value: string | null | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return undefined;
}

function errorKindForStatus(
  status: number,
  code: string | undefined,
): ClientDeviceErrorKind {
  if (status === 409) {
    return 'device_offline';
  }
  if (status === 403) {
    return code === 'device_access_requires_app_login'
      ? 'requires_app_login'
      : 'method_not_allowed';
  }
  if (status === 503) {
    return 'relay_unavailable';
  }
  if (status === 504) {
    return 'device_timeout';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  return 'server';
}

/**
 * Server errors arrive as `{error:{code,message}}`; some paths still send a
 * flat `{code}`. Nested wins, flat is the fallback.
 */
function extractErrorCode(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object') {
    const body = payload as {code?: unknown; error?: {code?: unknown}};
    if (typeof body.error?.code === 'string') {
      return body.error.code;
    }
    if (typeof body.code === 'string') {
      return body.code;
    }
  }
  return undefined;
}

function messageForKind(kind: ClientDeviceErrorKind, status: number): string {
  switch (kind) {
    case 'device_offline':
      return 'The device is offline.';
    case 'method_not_allowed':
      return 'The device does not allow this method.';
    case 'requires_app_login':
      return 'BotConnector app login is required for device access.';
    case 'relay_unavailable':
      return 'The local relay is unavailable.';
    case 'device_timeout':
      return 'The device timed out.';
    case 'rate_limited':
      return 'Too many pairing codes were requested.';
    default:
      return `Device request failed (${status}).`;
  }
}

async function errorFromResponse(
  response: Response,
): Promise<ClientDeviceError> {
  let code: string | undefined;
  try {
    code = extractErrorCode(await response.json());
  } catch {
    // Body may be empty or not JSON; status mapping still applies.
  }
  const kind = errorKindForStatus(response.status, code);
  return new ClientDeviceError(kind, messageForKind(kind, response.status), {
    statusCode: response.status,
    retryAfterSeconds:
      kind === 'rate_limited'
        ? parseRetryAfterSeconds(response.headers.get('Retry-After'))
        : undefined,
  });
}

/**
 * Reads the `accessToken` (bc_live_mobile_…) from the Keychain entry
 * BotConnectorAuthStore owns — READ ONLY (never writes or resets it). The
 * sessionToken in the same entry is intentionally NOT returned:
 * /v1/client/devices rejects it with 401 invalid_api_key. Returns null when
 * absent, unreadable, or expired.
 */
export async function getClientDeviceAccessToken(): Promise<string | null> {
  let credentials: {password: string} | false;
  try {
    credentials = await Keychain.getGenericPassword({
      service: AUTH_KEYCHAIN_SERVICE,
    });
  } catch {
    return null;
  }
  if (!credentials) {
    return null;
  }
  try {
    const session = JSON.parse(credentials.password) as {
      accessToken?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof session.expiresAt === 'number' &&
      session.expiresAt * 1000 <= Date.now()
    ) {
      return null;
    }
    if (typeof session.accessToken === 'string' && session.accessToken) {
      return session.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getClientDeviceAccessToken();
  if (!token) {
    throw new ClientDeviceError(
      'requires_app_login',
      messageForKind('requires_app_login', 403),
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function deviceFetch(
  url: string,
  init: {method: 'GET' | 'POST'; body?: string},
): Promise<Response> {
  const headers = await authHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: init.method,
      headers,
      body: init.body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw await errorFromResponse(response);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listClientDevices(): Promise<ClientDeviceListPayload> {
  const response = await deviceFetch(DEVICES_URL, {method: 'GET'});
  const payload = await response.json();
  if (payload?.object !== 'list' || !Array.isArray(payload?.data)) {
    throw new Error('Invalid client devices list response');
  }
  return payload as ClientDeviceListPayload;
}

/** Mints an 8-char pairing code the user types into Desktop / the device CLI. */
export async function pairClientDevice(): Promise<ClientDevicePairResult> {
  const response = await deviceFetch(`${DEVICES_URL}/pair`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const payload = await response.json();
  if (typeof payload?.code !== 'string' || !payload.code) {
    throw new Error('Invalid pair response');
  }
  return {
    code: payload.code,
    expiresAt: normalizePairExpiry(payload.expires_at),
  };
}

/** Server may send epoch seconds, epoch ms or an ISO string; fall back to the
 * contract's 5-minute validity when the field is missing or unparseable. */
function normalizePairExpiry(value: unknown): number {
  const fallback = Date.now() + 5 * 60 * 1000;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber < 1e12 ? asNumber * 1000 : asNumber;
    }
  }
  return fallback;
}

export async function requestClientDevice(options: {
  deviceId: string;
  method: ClientDeviceMethod;
  params?: Record<string, unknown>;
}): Promise<any> {
  assertClientDeviceMethod(options.method);
  const response = await deviceFetch(
    `${DEVICES_URL}/${encodeURIComponent(options.deviceId)}/request`,
    {
      method: 'POST',
      body: JSON.stringify({
        method: options.method,
        params: options.params ?? {},
      }),
    },
  );
  return response.json();
}

export async function revokeClientDevice(options: {
  deviceId: string;
}): Promise<any> {
  const response = await deviceFetch(
    `${DEVICES_URL}/${encodeURIComponent(options.deviceId)}/revoke`,
    {method: 'POST', body: JSON.stringify({})},
  );
  return response.json();
}

/**
 * Pure SSE line parser for tests and the stream: feeds chunks (which may split
 * events anywhere) and reports each parsed frame. `onEvent` receives chat
 * completion objects or the terminal 'done' marker.
 */
export function createClientDeviceSseParser(
  onEvent: (event: object | 'done') => void,
): {feed: (chunk: string) => void; flush: () => void} {
  const parser = new SSEParser();
  return {
    feed(chunk: string) {
      for (const event of parser.feed(chunk)) {
        onEvent(event);
      }
    },
    flush() {
      for (const event of parser.flush()) {
        onEvent(event);
      }
    },
  };
}

/**
 * SSE stream for chat.completions only (contract). Uses XMLHttpRequest with
 * incremental onprogress reads — the React Native-compatible way to consume
 * text/event-stream. Out of scope by design: wiring the events into the chat
 * pipeline (that lives in ChatScreen/ChatInput, untouched here).
 */
export function streamClientDeviceChat(options: {
  deviceId: string;
  params: Record<string, unknown>;
  onEvent?: (event: object) => void;
}): Promise<void> {
  return authHeaders().then(headers => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let lastProcessed = 0;
      let settled = false;
      const parser = createClientDeviceSseParser(event => {
        if (event === 'done') {
          return;
        }
        options.onEvent?.(event);
      });

      const fail = (error: ClientDeviceError) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };

      xhr.open(
        'POST',
        `${DEVICES_URL}/${encodeURIComponent(options.deviceId)}/stream`,
      );
      Object.entries(headers).forEach(([key, value]) =>
        xhr.setRequestHeader(key, value),
      );

      xhr.onprogress = () => {
        const chunk = xhr.responseText.slice(lastProcessed);
        lastProcessed = xhr.responseText.length;
        if (chunk) {
          parser.feed(chunk);
        }
      };

      xhr.onload = () => {
        if (settled) {
          return;
        }
        if (xhr.status !== 200) {
          let code: string | undefined;
          try {
            code = extractErrorCode(JSON.parse(xhr.responseText));
          } catch {
            // Non-JSON handshake body (e.g. an HTML error page): the
            // status mapping still applies.
          }
          const kind = errorKindForStatus(xhr.status, code);
          fail(
            new ClientDeviceError(kind, messageForKind(kind, xhr.status), {
              statusCode: xhr.status,
              retryAfterSeconds:
                kind === 'rate_limited'
                  ? parseRetryAfterSeconds(
                      /retry-after:\s*(\S+)/i.exec(
                        xhr.getAllResponseHeaders(),
                      )?.[1],
                    )
                  : undefined,
            }),
          );
          return;
        }
        const remaining = xhr.responseText.slice(lastProcessed);
        if (remaining) {
          parser.feed(remaining);
        }
        parser.flush();
        settled = true;
        resolve();
      };

      xhr.onerror = () => {
        fail(
          new ClientDeviceError('server', messageForKind('server', 0), {
            statusCode: 0,
          }),
        );
      };

      xhr.send(
        JSON.stringify({
          method: 'chat.completions',
          params: options.params,
        }),
      );
    });
  });
}
