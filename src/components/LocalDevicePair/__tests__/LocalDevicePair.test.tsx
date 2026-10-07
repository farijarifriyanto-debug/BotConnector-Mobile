/**
 * LocalDevicePair renders inside RemoteModelSheet §2 (BotConnector Local):
 * native-login gate, pair-code minting with countdown, rate-limit backoff,
 * device list with the contract's four status labels, display-only model
 * listing and confirmed revoke. No install/pull/delete/chat wiring exists
 * here by design.
 */
import React from 'react';
import {Alert} from 'react-native';

import {render, fireEvent, waitFor} from '../../../../jest/test-utils';
import {LocalDevicePair} from '../LocalDevicePair';
import {resolveDeviceStatus} from '../deviceStatus';
import {botConnectorAuthStore} from '../../../store';
import {l10n, t} from '../../../locales';
import {
  ClientDeviceError,
  listClientDevices,
  pairClientDevice,
  requestClientDevice,
  revokeClientDevice,
} from '../../../api/clientDevices';

jest.mock('../../../api/clientDevices', () => {
  const actual = jest.requireActual('../../../api/clientDevices');
  return {
    ...actual,
    listClientDevices: jest.fn(),
    pairClientDevice: jest.fn(),
    revokeClientDevice: jest.fn(),
    requestClientDevice: jest.fn(),
  };
});

const mockedList = listClientDevices as jest.Mock;
const mockedPair = pairClientDevice as jest.Mock;
const mockedRevoke = revokeClientDevice as jest.Mock;
const mockedRequest = requestClientDevice as jest.Mock;

const device = (id: string, name: string, online: boolean) => ({
  id,
  name,
  platform: 'linux',
  arch: 'x64',
  online,
});

describe('LocalDevicePair', () => {
  const authStore = botConnectorAuthStore as any;

  beforeEach(() => {
    authStore.isSignedIn = false;
    mockedList.mockResolvedValue({object: 'list', data: []});
    mockedPair.mockResolvedValue({
      code: 'PAIR1234',
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    mockedRequest.mockResolvedValue({data: []});
    mockedRevoke.mockResolvedValue({revoked: true});
  });

  it('signed out: explains that native login is required and starts it', async () => {
    const {getByText, getByTestId, queryByTestId} = render(<LocalDevicePair />);

    expect(getByText(l10n.en.settings.deviceRequiresLogin)).toBeTruthy();
    expect(queryByTestId('local-device-pair-cta')).toBeNull();

    fireEvent.press(getByTestId('local-device-signin'));
    await waitFor(() => {
      expect(authStore.startLogin).toHaveBeenCalledTimes(1);
    });
    expect(mockedList).not.toHaveBeenCalled();
    expect(mockedPair).not.toHaveBeenCalled();
  });

  it('signed in: minting a pair code shows it with an expiry countdown', async () => {
    authStore.isSignedIn = true;
    const {getByTestId, getByText, getByLabelText} = render(
      <LocalDevicePair />,
    );

    fireEvent.press(getByTestId('local-device-pair-cta'));

    await waitFor(() => {
      expect(getByText('PAIR1234')).toBeTruthy();
    });
    expect(getByLabelText('PAIR1234')).toBeTruthy();
    expect(
      getByText(
        new RegExp(t(l10n.en.settings.localPairExpires, {seconds: '\\d+'})),
      ),
    ).toBeTruthy();
    expect(getByText(l10n.en.settings.localPairCodeHint)).toBeTruthy();
    expect(mockedPair).toHaveBeenCalledTimes(1);
  });

  it('rate limited: shows the Retry-After wait and blocks the retry', async () => {
    authStore.isSignedIn = true;
    mockedPair.mockRejectedValueOnce(
      new ClientDeviceError('rate_limited', 'slow down', {
        statusCode: 429,
        retryAfterSeconds: 42,
      }),
    );
    const {getByTestId, getByText} = render(<LocalDevicePair />);

    fireEvent.press(getByTestId('local-device-pair-cta'));

    await waitFor(() => {
      expect(
        getByText(t(l10n.en.settings.localPairRateLimited, {seconds: 42})),
      ).toBeTruthy();
    });
    expect(
      getByTestId('local-device-pair-cta').props.accessibilityState?.disabled,
    ).toBe(true);
    expect(mockedPair).toHaveBeenCalledTimes(1);
  });

  it('lists devices with the Online/Offline status labels', async () => {
    authStore.isSignedIn = true;
    mockedList.mockResolvedValue({
      object: 'list',
      data: [device('d1', 'Workstation', true), device('d2', 'Old box', false)],
    });
    const {getByTestId, getByText} = render(<LocalDevicePair />);

    await waitFor(() => {
      expect(getByText(l10n.en.settings.deviceStatusOnline)).toBeTruthy();
    });
    expect(getByText(l10n.en.settings.deviceStatusOffline)).toBeTruthy();
    expect(getByTestId('local-device-row-d1')).toBeTruthy();
    expect(getByTestId('local-device-row-d2')).toBeTruthy();
    expect(getByTestId('local-device-status-d1')).toBeTruthy();
    expect(getByText('Workstation')).toBeTruthy();
    expect(getByText('Old box')).toBeTruthy();
  });

  it('revoke asks for confirmation before calling the API', async () => {
    authStore.isSignedIn = true;
    mockedList.mockResolvedValue({
      object: 'list',
      data: [device('d1', 'Workstation', true)],
    });
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const {getByTestId} = render(<LocalDevicePair />);

    await waitFor(() => {
      expect(getByTestId('local-device-revoke-d1')).toBeTruthy();
    });
    fireEvent.press(getByTestId('local-device-revoke-d1'));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(mockedRevoke).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] as any[];
    buttons.find((b: any) => b.style === 'destructive').onPress();
    await waitFor(() => {
      expect(mockedRevoke).toHaveBeenCalledWith({deviceId: 'd1'});
    });
    alertSpy.mockRestore();
  });

  it('shows fetched model names as display only', async () => {
    authStore.isSignedIn = true;
    mockedList.mockResolvedValue({
      object: 'list',
      data: [device('d1', 'Workstation', true)],
    });
    mockedRequest.mockResolvedValue({
      data: [{id: 'local-llama'}, {id: 'qwen-local'}],
    });
    const {getByTestId, getByText} = render(<LocalDevicePair />);

    await waitFor(() => {
      expect(getByTestId('local-device-models-d1')).toBeTruthy();
    });
    fireEvent.press(getByTestId('local-device-models-d1'));

    await waitFor(() => {
      expect(getByText('local-llama')).toBeTruthy();
    });
    expect(getByText('qwen-local')).toBeTruthy();
    expect(mockedRequest).toHaveBeenCalledWith({
      deviceId: 'd1',
      method: 'models.list',
      params: {},
    });
  });

  it('renders the empty-list hint when signed in with no devices', async () => {
    authStore.isSignedIn = true;
    const {getByText} = render(<LocalDevicePair />);

    await waitFor(() => {
      expect(getByText(l10n.en.settings.deviceListEmpty)).toBeTruthy();
    });
  });
});

describe('device status mapping', () => {
  const ctx = (
    refreshing: boolean,
    wasOnline: boolean,
    justPaired: boolean,
  ) => ({refreshing, wasOnline, justPaired});

  it('a device first seen after pairing reads Paired', () => {
    expect(resolveDeviceStatus({online: true}, ctx(false, false, true))).toBe(
      'paired',
    );
  });

  it('a refresh of a previously-online device reads Reconnecting', () => {
    expect(resolveDeviceStatus({online: true}, ctx(true, true, false))).toBe(
      'reconnecting',
    );
  });

  it('a refresh of anything else reads Offline', () => {
    expect(resolveDeviceStatus({online: false}, ctx(true, false, false))).toBe(
      'offline',
    );
  });

  it('outside a refresh the server online flag decides', () => {
    expect(resolveDeviceStatus({online: true}, ctx(false, false, false))).toBe(
      'online',
    );
    expect(resolveDeviceStatus({online: false}, ctx(false, true, false))).toBe(
      'offline',
    );
  });
});
