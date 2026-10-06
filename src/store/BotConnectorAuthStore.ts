import 'react-native-get-random-values';

import {Linking} from 'react-native';
import {makeAutoObservable, runInAction} from 'mobx';
import * as Keychain from 'react-native-keychain';
import {sha256} from 'js-sha256';

import {
  BOTCONNECTOR_API_BASE_URL,
  BOTCONNECTOR_NAME,
  BOTCONNECTOR_REQUEST_TIMEOUT_MS,
  isBotConnectorApiUrl,
} from '../config/botconnector';
import {serverStore} from './ServerStore';
import {modelStore} from './ModelStore';

const NATIVE_CLIENT_ID = 'botconnector-mobile';
const LOGIN_START_URL = 'https://botconnector.id/app-login/start';
const NATIVE_EXCHANGE_URL = 'https://botconnector.id/app-login/native/exchange';
const NATIVE_SESSION_URL = 'https://botconnector.id/app-login/native/session';
const NATIVE_LOGOUT_URL = 'https://botconnector.id/app-login/native/logout';

const AUTH_KEYCHAIN_SERVICE = 'botconnector-native-auth-v1';
const PENDING_KEYCHAIN_SERVICE = 'botconnector-native-login-pending-v1';

type PendingLogin = {
  state: string;
  verifier: string;
  createdAt: number;
};

export type BotConnectorNativeSession = {
  sessionToken: string;
  accessToken: string;
  userId: string;
  expiresAt: number;
};

export type BotConnectorAccount = {
  user_id: string;
  email?: string | null;
  display_name?: string | null;
  created_at: number;
  expires_at: number;
  plan: string;
  available_micros: number;
  has_payg: boolean;
  plan_models: string[];
  cloud: {
    limit_tokens_24h: number;
    used_tokens_24h: number;
    remaining_tokens_24h: number;
  };
};

const encodeBase64Url = (bytes: readonly number[]): string => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    output += alphabet[(triple >>> 18) & 63];
    output += alphabet[(triple >>> 12) & 63];
    output += i + 1 < bytes.length ? alphabet[(triple >>> 6) & 63] : '=';
    output += i + 2 < bytes.length ? alphabet[triple & 63] : '=';
  }
  return output.split('+').join('-').split('/').join('_').replace(/=+$/g, '');
};

const secureRandomBase64Url = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength);
  const cryptoObject = (globalThis as any).crypto;
  if (!cryptoObject?.getRandomValues) {
    throw new Error('Secure random generator is unavailable.');
  }
  cryptoObject.getRandomValues(bytes);
  return encodeBase64Url(Array.from(bytes));
};

const pkceChallenge = (verifier: string): string =>
  encodeBase64Url(sha256.array(verifier));

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message =
      typeof payload?.detail === 'string'
        ? payload.detail
        : 'BotConnector login request failed.';
    throw new Error(message);
  }
  return payload as T;
};

class BotConnectorAuthStore {
  account: BotConnectorAccount | null = null;
  /** A credential exists in the Keychain (even if the account could not be resolved yet, e.g. offline). */
  hasStoredSession = false;
  isRestoring = false;
  isSigningIn = false;
  error: string | null = null;

  // The authorization code is single-use. Whatever delivers the callback (native
  // module, RN Linking, a cold-start replay) must never exchange it twice.
  private isOpeningLogin = false;
  private lastResolvedAt = 0;
  private handledCallbacks = new Set<string>();
  private callbacksInFlight = new Map<string, Promise<boolean>>();

  constructor() {
    makeAutoObservable<
      this,
      | 'handledCallbacks'
      | 'callbacksInFlight'
      | 'isOpeningLogin'
      | 'lastResolvedAt'
    >(this, {
      handledCallbacks: false,
      callbacksInFlight: false,
      isOpeningLogin: false,
      lastResolvedAt: false,
    });
  }

  get isSignedIn(): boolean {
    return this.account !== null || this.hasStoredSession;
  }

  private async readJsonSecret<T>(service: string): Promise<T | null> {
    const credentials = await Keychain.getGenericPassword({service});
    if (!credentials) {
      return null;
    }
    try {
      return JSON.parse(credentials.password) as T;
    } catch {
      await Keychain.resetGenericPassword({service});
      return null;
    }
  }

  private async writeJsonSecret(
    service: string,
    username: string,
    value: unknown,
  ): Promise<void> {
    await Keychain.setGenericPassword(username, JSON.stringify(value), {
      service,
    });
  }

  private async readSession(): Promise<BotConnectorNativeSession | null> {
    return this.readJsonSecret<BotConnectorNativeSession>(
      AUTH_KEYCHAIN_SERVICE,
    );
  }

  private async clearLocalAuth(): Promise<void> {
    await Promise.all([
      Keychain.resetGenericPassword({service: AUTH_KEYCHAIN_SERVICE}),
      Keychain.resetGenericPassword({service: PENDING_KEYCHAIN_SERVICE}),
    ]);
    runInAction(() => {
      this.account = null;
      this.hasStoredSession = false;
      this.isSigningIn = false;
    });

    // Remove every trace of the Cloud account: credential, cached model list,
    // selected models and capability caches; and stop using a Cloud model that
    // is still active in chat.
    const official = serverStore.servers.find(server =>
      isBotConnectorApiUrl(server.url),
    );
    if (official) {
      if (modelStore.activeRemoteBinding?.serverId === official.id) {
        try {
          await modelStore.releaseContext(true);
        } catch {
          // Continue cleanup; the credential removal below is what matters.
        }
      }
      serverStore.removeServer(official.id);
    }
  }

  private async installCloudCredential(accessToken: string): Promise<string> {
    let official = serverStore.servers.find(server =>
      isBotConnectorApiUrl(server.url),
    );
    if (!official) {
      const id = serverStore.addServer({
        name: BOTCONNECTOR_NAME,
        url: BOTCONNECTOR_API_BASE_URL,
        requestTimeoutMs: BOTCONNECTOR_REQUEST_TIMEOUT_MS,
        serverType: 'OpenAI',
      });
      official = serverStore.servers.find(server => server.id === id)!;
    } else {
      serverStore.updateServer(official.id, {
        name: BOTCONNECTOR_NAME,
        url: BOTCONNECTOR_API_BASE_URL,
        requestTimeoutMs:
          official.requestTimeoutMs ?? BOTCONNECTOR_REQUEST_TIMEOUT_MS,
        serverType: 'OpenAI',
      });
    }

    await serverStore.setApiKey(official.id, accessToken);
    await serverStore.fetchModelsForServer(official.id);
    return official.id;
  }

  async startLogin(): Promise<void> {
    // The browser round-trip is not a "signing in" state: if the user abandons it
    // the button must stay usable. Only guard against a double tap while opening.
    if (this.isOpeningLogin || this.isSigningIn) {
      return;
    }
    this.isOpeningLogin = true;
    runInAction(() => {
      this.error = null;
    });

    try {
      const pending: PendingLogin = {
        state: secureRandomBase64Url(32),
        verifier: secureRandomBase64Url(32),
        createdAt: Date.now(),
      };
      await this.writeJsonSecret(PENDING_KEYCHAIN_SERVICE, 'pkce', pending);
      const url = new URL(LOGIN_START_URL);
      url.searchParams.set('client_id', NATIVE_CLIENT_ID);
      url.searchParams.set('state', pending.state);
      url.searchParams.set('code_challenge', pkceChallenge(pending.verifier));
      url.searchParams.set('code_challenge_method', 'S256');
      await Linking.openURL(url.toString());
    } catch (error) {
      runInAction(() => {
        this.error =
          error instanceof Error ? error.message : 'Unable to start login.';
      });
      throw error;
    } finally {
      this.isOpeningLogin = false;
    }
  }

  isAuthCallback(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === 'botconnector:' &&
        parsed.hostname === 'auth' &&
        parsed.pathname === '/callback'
      );
    } catch {
      return false;
    }
  }

  async handleAuthCallback(url: string): Promise<boolean> {
    if (!this.isAuthCallback(url)) {
      return false;
    }
    let key = url;
    try {
      key = new URL(url).searchParams.get('code') || url;
    } catch {
      // isAuthCallback already validated the URL shape.
    }
    if (this.handledCallbacks.has(key)) {
      return true;
    }
    const running = this.callbacksInFlight.get(key);
    if (running) {
      return running;
    }
    const attempt = this.exchangeCallback(url).finally(() => {
      this.callbacksInFlight.delete(key);
    });
    this.callbacksInFlight.set(key, attempt);
    this.handledCallbacks.add(key); // consumed (or burned) either way
    return attempt;
  }

  private async exchangeCallback(url: string): Promise<boolean> {
    runInAction(() => {
      this.isSigningIn = true;
      this.error = null;
    });

    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      const returnedState = parsed.searchParams.get('state');
      const pending = await this.readJsonSecret<PendingLogin>(
        PENDING_KEYCHAIN_SERVICE,
      );

      if (
        !code ||
        !returnedState ||
        !pending ||
        pending.state !== returnedState ||
        Date.now() - pending.createdAt > 10 * 60 * 1000
      ) {
        throw new Error('Login callback is invalid or expired.');
      }

      const response = await fetch(NATIVE_EXCHANGE_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          code,
          state: returnedState,
          client_id: NATIVE_CLIENT_ID,
          code_verifier: pending.verifier,
        }),
      });
      const exchange = await parseJsonResponse<{
        user_id: string;
        session_token: string;
        access_token: string;
        expires_at: number;
      }>(response);

      const session: BotConnectorNativeSession = {
        sessionToken: exchange.session_token,
        accessToken: exchange.access_token,
        userId: exchange.user_id,
        expiresAt: exchange.expires_at,
      };

      await this.writeJsonSecret(AUTH_KEYCHAIN_SERVICE, 'session', session);
      await Keychain.resetGenericPassword({
        service: PENDING_KEYCHAIN_SERVICE,
      });
      runInAction(() => {
        this.hasStoredSession = true;
      });
      await this.installCloudCredential(session.accessToken);
      await this.refreshAccount(session);

      runInAction(() => {
        this.isSigningIn = false;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.isSigningIn = false;
        this.error =
          error instanceof Error ? error.message : 'BotConnector login failed.';
      });
      throw error;
    }
  }

  private async refreshAccount(
    knownSession?: BotConnectorNativeSession,
  ): Promise<BotConnectorAccount | null> {
    const session = knownSession ?? (await this.readSession());
    if (!session) {
      runInAction(() => {
        this.account = null;
        this.hasStoredSession = false;
      });
      return null;
    }
    runInAction(() => {
      this.hasStoredSession = true;
    });
    if (session.expiresAt * 1000 <= Date.now()) {
      await this.clearLocalAuth();
      return null;
    }

    const response = await fetch(NATIVE_SESSION_URL, {
      method: 'GET',
      headers: {Authorization: `Bearer ${session.sessionToken}`},
    });
    if (response.status === 401) {
      await this.clearLocalAuth();
      return null;
    }
    const account = await parseJsonResponse<BotConnectorAccount>(response);
    this.lastResolvedAt = Date.now();
    runInAction(() => {
      this.account = account;
    });
    return account;
  }

  /**
   * Re-check the session when the app returns to the foreground (throttled), so a session that was
   * revoked or expired while the app stayed alive turns into "signed out" instead of failing silently.
   * Network errors keep the credential (offline is not a logout).
   */
  async revalidate(minIntervalMs = 5 * 60 * 1000): Promise<void> {
    if (
      !this.hasStoredSession ||
      this.isRestoring ||
      this.isSigningIn ||
      Date.now() - this.lastResolvedAt < minIntervalMs
    ) {
      return;
    }
    try {
      await this.refreshAccount();
    } catch {
      // offline / transient: keep the credential, try again on the next foreground
    }
  }

  /** Session resolved on relaunch: make sure the Cloud credential/models are installed (idempotent). */
  private async ensureCloudInstalled(): Promise<void> {
    const session = await this.readSession();
    if (session) {
      await this.installCloudCredential(session.accessToken);
    }
  }

  async restore(): Promise<void> {
    if (this.isRestoring) {
      return;
    }
    runInAction(() => {
      this.isRestoring = true;
      this.error = null;
    });
    try {
      const account = await this.refreshAccount();
      if (account) {
        await this.ensureCloudInstalled();
      }
    } catch (error) {
      runInAction(() => {
        this.error =
          error instanceof Error
            ? error.message
            : 'Unable to restore BotConnector account.';
      });
    } finally {
      runInAction(() => {
        this.isRestoring = false;
      });
    }
  }

  async logout(): Promise<void> {
    const session = await this.readSession();
    if (session) {
      try {
        await fetch(NATIVE_LOGOUT_URL, {
          method: 'POST',
          headers: {Authorization: `Bearer ${session.sessionToken}`},
        });
      } catch {
        // Local cleanup must still proceed; server session expires on its own.
      }
    }
    await this.clearLocalAuth();
  }
}

export const botConnectorAuthStore = new BotConnectorAuthStore();
