import React from 'react';
import {Alert} from 'react-native';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {botConnectorAuthStore} from '../../../store';
import {DeleteAccountDialog} from '../DeleteAccountDialog';

describe('DeleteAccountDialog', () => {
  const onDismiss = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  const fill = (screen: any, phrase: string, password: string) => {
    fireEvent.changeText(screen.getByTestId('delete-account-phrase'), phrase);
    fireEvent.changeText(
      screen.getByTestId('delete-account-password'),
      password,
    );
  };

  it('needs the exact phrase and a password before the delete action is enabled', () => {
    const screen = render(
      <DeleteAccountDialog visible onDismiss={onDismiss} />,
    );
    const confirm = () => screen.getByTestId('delete-account-confirm');
    expect(confirm().props.accessibilityState?.disabled).toBe(true);
    fill(screen, 'hapus', 'pw');
    expect(confirm().props.accessibilityState?.disabled).toBe(true);
    fill(screen, 'HAPUS AKUN', '');
    expect(confirm().props.accessibilityState?.disabled).toBe(true);
    fill(screen, ' HAPUS AKUN ', 'pw');
    expect(confirm().props.accessibilityState?.disabled).toBe(false);
  });

  it('deletes, closes and tells the user when the server accepts', async () => {
    const spy = jest
      .spyOn(botConnectorAuthStore, 'deleteAccount')
      .mockResolvedValue({ok: true});
    const screen = render(
      <DeleteAccountDialog visible onDismiss={onDismiss} />,
    );
    fill(screen, 'HAPUS AKUN', 'pw-1');
    fireEvent.press(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith('pw-1', 'HAPUS AKUN');
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('shows a specific message for a wrong password and stays open', async () => {
    jest
      .spyOn(botConnectorAuthStore, 'deleteAccount')
      .mockResolvedValue({ok: false, reason: 'wrong_password'});
    const screen = render(
      <DeleteAccountDialog visible onDismiss={onDismiss} />,
    );
    fill(screen, 'HAPUS AKUN', 'bad');
    fireEvent.press(screen.getByTestId('delete-account-confirm'));
    await waitFor(() => screen.getByTestId('delete-account-error'));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByTestId('delete-account-error').props.children).toMatch(
      /password/i,
    );
  });
});
