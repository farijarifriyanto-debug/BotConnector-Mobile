import React from 'react';
import {Alert, StyleSheet} from 'react-native';

import {fireEvent, render} from '../../../../jest/test-utils';
import {l10n, t} from '../../../locales';
import {botConnectorAuthStore, serverStore} from '../../../store';
import {BotConnectorAccountCard} from '../BotConnectorAccountCard';

describe('BotConnectorAccountCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (botConnectorAuthStore as any).account = null;
    (botConnectorAuthStore as any).hasStoredSession = false;
    (botConnectorAuthStore as any).isSignedIn = false;
    (botConnectorAuthStore as any).isSigningIn = false;
    (botConnectorAuthStore as any).isRestoring = false;
    (botConnectorAuthStore as any).error = null;
    serverStore.botConnectorAccess = {};
  });

  it('stacks identity over a stretched sign-in action when signed out', () => {
    const startLoginSpy = jest
      .spyOn(botConnectorAuthStore, 'startLogin')
      .mockResolvedValue(undefined);

    const screen = render(<BotConnectorAccountCard />);
    const {getByTestId, getAllByText} = screen;

    const card = getByTestId('botconnector-account-card');
    expect(StyleSheet.flatten(card.props.style)?.flexDirection).toBeUndefined();

    // Paper splits the button across layers and suffixes the testID on some
    // of them, so assert the stretch style lands anywhere in the action's
    // node chain rather than on one specific layer.
    const action = getByTestId('botconnector-account-action');
    expect(
      screen.root.findAll(
        (n: any) =>
          typeof n.props?.testID === 'string' &&
          n.props.testID.startsWith('botconnector-account-action') &&
          StyleSheet.flatten(n.props.style as any)?.alignSelf === 'stretch',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      getAllByText(l10n.en.settings.connectBotConnector).length,
    ).toBeGreaterThan(0);

    fireEvent.press(action);
    expect(startLoginSpy).toHaveBeenCalledTimes(1);
    startLoginSpy.mockRestore();
  });

  it('lays out in a row when compact', () => {
    const {getByTestId} = render(<BotConnectorAccountCard compact />);

    const card = getByTestId('botconnector-account-card');
    expect(StyleSheet.flatten(card.props.style)?.flexDirection).toBe('row');
  });

  it('shows account identity and asks to confirm before signing out', () => {
    (botConnectorAuthStore as any).account = {
      display_name: 'Fari',
      email: 'fari@example.com',
      plan: 'plus',
    };
    (botConnectorAuthStore as any).isSignedIn = true;
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const logoutSpy = jest
      .spyOn(botConnectorAuthStore, 'logout')
      .mockResolvedValue(undefined);

    const {getByTestId, getByText} = render(<BotConnectorAccountCard />);

    expect(getByText('Fari')).toBeTruthy();
    expect(getByText('fari@example.com')).toBeTruthy();
    expect(getByText('PLUS')).toBeTruthy();
    expect(getByText(l10n.en.palsScreen.signOut)).toBeTruthy();

    const action = getByTestId('botconnector-account-action');
    fireEvent.press(action);

    // Destructive action: must not log out before confirmation.
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe(l10n.en.palsScreen.signOut);
    expect(body).toBe(l10n.en.palsScreen.signOutConfirmation);
    const cancel = (buttons as any[]).find(b => b.style === 'cancel');
    const confirm = (buttons as any[]).find(b => b.style === 'destructive');
    expect(cancel).toBeDefined();
    expect(confirm).toBeDefined();

    cancel.onPress?.();
    expect(logoutSpy).not.toHaveBeenCalled();

    confirm.onPress();
    expect(logoutSpy).toHaveBeenCalledTimes(1);

    alertSpy.mockRestore();
    logoutSpy.mockRestore();
  });

  it('disables the action while a stored session is being restored', () => {
    (botConnectorAuthStore as any).isRestoring = true;

    const {getByTestId} = render(<BotConnectorAccountCard />);

    const action = getByTestId('botconnector-account-action');
    expect(action.props.accessibilityState?.disabled).toBe(true);
  });

  describe('PAYG status line', () => {
    it('shows the exact PAYG balance when PAYG is active', () => {
      (botConnectorAuthStore as any).account = {
        display_name: 'Fari',
        plan: 'plus',
        has_payg: true,
        available_micros: 5_000_000,
      };
      (botConnectorAuthStore as any).isSignedIn = true;

      const {getByText} = render(<BotConnectorAccountCard />);

      expect(
        getByText(t(l10n.en.settings.paygActive, {balance: '$5.00'})),
      ).toBeTruthy();
    });

    it('states a zero PAYG balance explicitly and invents no numbers', () => {
      (botConnectorAuthStore as any).account = {
        display_name: 'Fari',
        plan: 'plus',
        has_payg: true,
        available_micros: 0,
      };
      (botConnectorAuthStore as any).isSignedIn = true;

      const {getByText, queryByText} = render(<BotConnectorAccountCard />);

      expect(getByText(l10n.en.settings.paygZero)).toBeTruthy();
      expect(queryByText(l10n.en.settings.paygActive)).toBeNull();
      expect(queryByText(/\$[1-9]/)).toBeNull();
    });

    it('reports PAYG unavailable when the feature is not enabled', () => {
      (botConnectorAuthStore as any).account = {
        display_name: 'Fari',
        plan: 'free',
        has_payg: false,
        available_micros: 0,
      };
      (botConnectorAuthStore as any).isSignedIn = true;

      const {getByText, queryByText} = render(<BotConnectorAccountCard />);

      expect(getByText(l10n.en.settings.paygUnavailable)).toBeTruthy();
      expect(queryByText(l10n.en.settings.paygZero)).toBeNull();
    });

    it('reports the balance as unknown when the payload omits it (never as zero)', () => {
      (botConnectorAuthStore as any).account = {
        display_name: 'Fari',
        plan: 'plus',
        has_payg: true,
      };
      (botConnectorAuthStore as any).isSignedIn = true;

      const {getByText, queryByText} = render(<BotConnectorAccountCard />);

      expect(getByText(l10n.en.settings.paygUnknown)).toBeTruthy();
      expect(queryByText(l10n.en.settings.paygZero)).toBeNull();
      expect(queryByText(/\$0\.00/)).toBeNull();
    });

    it('prefers payg.state from the capabilities payload over account fields', () => {
      // The account payload still says active/$5.00, but the capabilities
      // payload (server truth) reports zero — zero wins, and no fake $5.00
      // may appear.
      (botConnectorAuthStore as any).account = {
        display_name: 'Fari',
        plan: 'plus',
        has_payg: true,
        available_micros: 5_000_000,
      };
      (botConnectorAuthStore as any).isSignedIn = true;
      serverStore.botConnectorAccess = {
        bc: {
          object: 'botconnector.client_capabilities',
          plan: 'plus',
          payg: {state: 'zero', available_micros: 0},
          capabilities: {
            chat: true,
            web_search: true,
            read_url: true,
            tools: true,
            vision: true,
            media: true,
          },
        } as any,
      };

      const {getByText, queryByText} = render(<BotConnectorAccountCard />);

      expect(getByText(l10n.en.settings.paygZero)).toBeTruthy();
      expect(queryByText(/\$5\.00/)).toBeNull();
      expect(queryByText(l10n.en.settings.paygActive)).toBeNull();
    });

    it('falls back to account fields when no capabilities payload carried payg', () => {
      (botConnectorAuthStore as any).account = {
        display_name: 'Fari',
        plan: 'plus',
        has_payg: true,
        available_micros: 2_500_000,
      };
      (botConnectorAuthStore as any).isSignedIn = true;
      // Capabilities loaded, but without a payg block (older payload).
      serverStore.botConnectorAccess = {
        bc: {
          object: 'botconnector.client_capabilities',
          plan: 'plus',
          capabilities: {
            chat: true,
            web_search: true,
            read_url: true,
            tools: true,
            vision: true,
            media: true,
          },
        } as any,
      };

      const {getByText} = render(<BotConnectorAccountCard />);
      expect(
        getByText(t(l10n.en.settings.paygActive, {balance: '$2.50'})),
      ).toBeTruthy();
    });
  });

  describe('read-only mode (informational surfaces such as About)', () => {
    it('shows account status without any sign-in or sign-out action', () => {
      (botConnectorAuthStore as any).account = {
        display_name: 'Fari',
        email: 'fari@example.com',
        plan: 'plus',
        has_payg: false,
        available_micros: 0,
      };
      (botConnectorAuthStore as any).isSignedIn = true;

      const {getByTestId, queryByTestId, getByText} = render(
        <BotConnectorAccountCard readOnly />,
      );

      expect(getByTestId('botconnector-account-card')).toBeTruthy();
      expect(getByText('Fari')).toBeTruthy();
      expect(queryByTestId('botconnector-account-action')).toBeNull();
    });

    it('points to Settings for signing in instead of acting inline', () => {
      const startLoginSpy = jest
        .spyOn(botConnectorAuthStore, 'startLogin')
        .mockResolvedValue(undefined);

      const {queryByTestId, getByText} = render(
        <BotConnectorAccountCard readOnly />,
      );

      expect(queryByTestId('botconnector-account-action')).toBeNull();
      expect(getByText(l10n.en.settings.accountManageInSettings)).toBeTruthy();
      expect(startLoginSpy).not.toHaveBeenCalled();
      startLoginSpy.mockRestore();
    });

    it('never triggers the sign-out confirmation in read-only mode', () => {
      (botConnectorAuthStore as any).account = {
        display_name: 'Fari',
        plan: 'plus',
        has_payg: true,
        available_micros: 1_000_000,
      };
      const alertSpy = jest
        .spyOn(Alert, 'alert')
        .mockImplementation(() => undefined);

      const {queryByTestId} = render(<BotConnectorAccountCard readOnly />);

      expect(queryByTestId('botconnector-account-action')).toBeNull();
      expect(alertSpy).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });
});
