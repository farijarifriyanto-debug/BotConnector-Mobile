/**
 * useDeepLinking — BotConnector login callback.
 *
 * The one-time authorization code must be consumed by exactly one delivery
 * path per platform: the native emitter on iOS/Mac Catalyst, RN Linking on
 * Android. A second consumer would exchange the code twice.
 */

import {Alert, AppState, Linking, Platform} from 'react-native';
import {renderHook} from '@testing-library/react-native';

import {useDeepLinking} from '../useDeepLinking';
import {botConnectorAuthStore} from '../../store';

const AUTH_URL = 'botconnector://auth/callback?code=abc&state=xyz';

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      addListener: jest.fn(() => ({remove: jest.fn()})),
      goBack: jest.fn(),
      setOptions: jest.fn(),
      dispatch: jest.fn(),
    }),
  };
});

let registeredHandler: ((params: any) => void) | undefined;
jest.mock('../../services/DeepLinkService', () => ({
  deepLinkService: {
    initialize: jest.fn(),
    addListener: jest.fn((cb: any) => {
      registeredHandler = cb;
      return () => {};
    }),
    cleanup: jest.fn(),
  },
}));

const authStore = botConnectorAuthStore as any;
const originalOS = Platform.OS;

describe('useDeepLinking — auth callback delivery', () => {
  let urlListeners: Array<(e: {url: string}) => void> = [];
  let appStateListener: ((s: string) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredHandler = undefined;
    urlListeners = [];
    (global as any).__E2E__ = false;
    authStore.isAuthCallback.mockImplementation((url: string) =>
      url.startsWith('botconnector://auth/callback'),
    );
    authStore.handleAuthCallback.mockResolvedValue(true);
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((
      _: string,
      cb: any,
    ) => {
      urlListeners.push(cb);
      return {
        remove: jest.fn(() => {
          urlListeners = urlListeners.filter(listener => listener !== cb);
        }),
      };
    }) as any);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _: string,
      cb: any,
    ) => {
      appStateListener = cb;
      return {remove: jest.fn()};
    }) as any);
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {value: originalOS});
    jest.restoreAllMocks();
  });

  it('iOS/Catalyst: the native emitter is the only consumer of the callback', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'ios'});
    renderHook(() => useDeepLinking());
    await Promise.resolve();

    // Linking must not consume the auth URL on iOS.
    urlListeners.forEach(listener => listener({url: AUTH_URL}));
    expect(authStore.handleAuthCallback).not.toHaveBeenCalled();

    await registeredHandler!({host: 'auth', url: AUTH_URL});
    expect(authStore.handleAuthCallback).toHaveBeenCalledTimes(1);
    expect(authStore.handleAuthCallback).toHaveBeenCalledWith(AUTH_URL);
  });

  it('Android: RN Linking (warm and cold) is the consumer, the native emitter is not', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    (Linking.getInitialURL as jest.Mock).mockResolvedValue(AUTH_URL);
    renderHook(() => useDeepLinking());
    await new Promise(resolve => setImmediate(resolve));
    expect(authStore.handleAuthCallback).toHaveBeenCalledTimes(1);

    urlListeners.forEach(listener => listener({url: AUTH_URL}));
    expect(authStore.handleAuthCallback).toHaveBeenCalledTimes(2); // store de-duplicates the code itself
  });

  it('shows an alert (and does not crash) when the exchange fails', async () => {
    Object.defineProperty(Platform, 'OS', {value: 'ios'});
    authStore.handleAuthCallback.mockRejectedValueOnce(new Error('boom'));
    renderHook(() => useDeepLinking());
    await Promise.resolve();

    await registeredHandler!({host: 'auth', url: AUTH_URL});
    expect(Alert.alert).toHaveBeenCalledWith('BotConnector', 'boom', [
      {text: 'OK'},
    ]);
  });

  it('restores the account on launch and re-validates when the app returns to the foreground', async () => {
    renderHook(() => useDeepLinking());
    await Promise.resolve();
    expect(authStore.restore).toHaveBeenCalledTimes(1);

    appStateListener?.('background');
    expect(authStore.revalidate).not.toHaveBeenCalled();
    appStateListener?.('active');
    expect(authStore.revalidate).toHaveBeenCalledTimes(1);
  });
});
