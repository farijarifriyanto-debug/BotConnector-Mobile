import {runInAction} from 'mobx';

import {user} from '../../../../jest/fixtures';
import {fireEvent, render} from '../../../../jest/test-utils';
import {botConnectorAuthStore, uiStore} from '../../../store';
import {ChatView} from '../ChatView';

jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: () => null,
}));

// jest.mock factories may not close over module-scope imports (React, View,
// TouchableOpacity), so the stub requires what it needs inside the factory.
jest.mock('../../ChatPalModelPickerSheet', () => {
  const react = require('react');
  const {View, TouchableOpacity} = require('react-native');
  return {
    ChatPalModelPickerSheet: (props: {onConnectAccount?: () => void}) =>
      react.createElement(
        View,
        null,
        react.createElement(TouchableOpacity, {
          testID: 'picker-connect-account',
          accessibilityRole: 'button',
          onPress: props.onConnectAccount,
        }),
      ),
  };
});

describe('ChatView account sign-in entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      uiStore.modelPickerVisible = true;
    });
  });

  afterEach(() => {
    runInAction(() => {
      uiStore.modelPickerVisible = false;
    });
  });

  it('closes the picker and starts native sign-in (no Models tab detour)', () => {
    const startLoginSpy = jest
      .spyOn(botConnectorAuthStore, 'startLogin')
      .mockResolvedValue(undefined);

    const screen = render(
      <ChatView messages={[]} onSendPress={jest.fn()} user={user} />,
      {
        withSafeArea: true,
        withNavigation: true,
        withBottomSheetProvider: true,
      },
    );

    fireEvent.press(screen.getByTestId('picker-connect-account'));

    expect(startLoginSpy).toHaveBeenCalledTimes(1);
    expect(uiStore.modelPickerVisible).toBe(false);

    startLoginSpy.mockRestore();
  });
});
