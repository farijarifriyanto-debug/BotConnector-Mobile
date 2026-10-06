import React from 'react';
import {Alert, StyleSheet} from 'react-native';

import {fireEvent, render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {botConnectorAuthStore} from '../../../store';
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
});
