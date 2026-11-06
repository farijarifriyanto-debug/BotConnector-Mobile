import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {Keyboard} from 'react-native';

import {ChatPalModelPickerSheet} from '../ChatPalModelPickerSheet';
import {UserContext, L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {user} from '../../../../jest/fixtures';

jest.mock('../../../store', () => ({
  modelStore: {
    availableModels: [],
    remoteModels: [],
    activeModel: undefined,
    activeModelId: null,
    selectModel: jest.fn(),
  },
  serverStore: {
    servers: [],
    serverModels: new Map(),
  },
  uiStore: {openModelPicker: jest.fn()},
  palStore: {pals: []},
  chatSessionStore: {activePalId: null, setActivePal: jest.fn()},
}));

jest.mock('../../../store/ByokProviderStore', () => ({
  byokProviderStore: {providers: []},
}));

jest.mock('../../AddProviderSheet', () => {
  const {Text} = require('react-native');
  return {
    AddProviderSheet: ({isVisible}: {isVisible: boolean}) =>
      isVisible ? <Text testID="add-provider-sheet">open</Text> : null,
  };
});

jest.mock('@gorhom/bottom-sheet', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: mockReact.forwardRef(({children}: any, ref: any) =>
      mockReact.createElement('View', {ref, testID: 'bottom-sheet'}, children),
    ),
    BottomSheetFlatList: ({data, renderItem}: any) =>
      mockReact.createElement(
        'View',
        {testID: 'bottom-sheet-flatlist'},
        data?.map((item: any, index: number) =>
          mockReact.createElement(
            'View',
            {key: item.id},
            renderItem({item, index}),
          ),
        ),
      ),
    BottomSheetFlatListMethods: {},
    BottomSheetScrollView: ({children}: any) =>
      mockReact.createElement('View', {}, children),
    BottomSheetTextInput: (props: any) =>
      mockReact.createElement('TextInput', props),
    BottomSheetView: ({children}: any) =>
      mockReact.createElement('View', {}, children),
  };
});

jest.spyOn(Keyboard, 'dismiss').mockImplementation(jest.fn());
jest
  .spyOn(Keyboard, 'addListener')
  .mockImplementation(() => ({remove: jest.fn()}) as any);

const text = l10n.en.components.modelPicker;

const renderSheet = () =>
  render(
    <UserContext.Provider value={user}>
      <L10nContext.Provider value={l10n.en}>
        <ChatPalModelPickerSheet
          isVisible
          chatInputHeight={60}
          onClose={jest.fn()}
          onModelSelect={jest.fn()}
        />
      </L10nContext.Provider>
    </UserContext.Provider>,
  );

describe('ChatPalModelPickerSheet - Add provider entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an Add provider row in the models tab', () => {
    const {getByTestId} = renderSheet();

    expect(getByTestId('model-picker-add-provider')).toBeTruthy();
  });

  it('opens the AddProviderSheet from that row', () => {
    const {getByTestId, queryByTestId} = renderSheet();
    expect(queryByTestId('add-provider-sheet')).toBeNull();

    fireEvent.press(getByTestId('model-picker-add-provider'));

    expect(getByTestId('add-provider-sheet')).toBeTruthy();
  });

  it('shows no-models guidance instead of a generic error', () => {
    const {getByText, queryByText} = renderSheet();

    expect(getByText(text.noModelsGuidance)).toBeTruthy();
    expect(queryByText(text.loadFailed)).toBeNull();
  });
});
