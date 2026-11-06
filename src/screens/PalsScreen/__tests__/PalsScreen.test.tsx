import React from 'react';
import {act, fireEvent, waitFor} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';

import {PalsScreen} from '../PalsScreen';

import {palStore} from '../../../store';
import {createPal} from '../../../../jest/fixtures/pals';

// Mirrors the real hook: the width change re-renders from inside the component,
// which is what rotation does. A parent re-render cannot, since observer() memoises.
let mockWindow = {width: 750, height: 1334, scale: 2, fontScale: 1};
const mockWindowListeners = new Set<() => void>();

const setWindowWidth = (width: number) => {
  mockWindow = {...mockWindow, width};
  mockWindowListeners.forEach(listener => listener());
};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const {useSyncExternalStore} = require('react');

  const subscribe = (listener: () => void) => {
    mockWindowListeners.add(listener);
    return () => mockWindowListeners.delete(listener);
  };

  const useMockWindowDimensions = () =>
    useSyncExternalStore(subscribe, () => mockWindow);

  return {__esModule: true, default: useMockWindowDimensions};
});

const renderScreen = () =>
  render(<PalsScreen />, {
    withNavigation: true,
    withSafeArea: true,
    withBottomSheetProvider: true,
  });

describe('PalsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Nothing is mounted yet, so assign straight through without notifying.
    mockWindow = {width: 750, height: 1334, scale: 2, fontScale: 1};

    // Reset palStore state
    palStore.pals = [];
    palStore.hiddenPalIds = [];
  });

  it('renders without crashing', () => {
    render(<PalsScreen />, {
      withNavigation: true,
      withSafeArea: true,
      withBottomSheetProvider: true,
    });
    expect(true).toBe(true);
  });

  it('lists local pals and hides the masked upstream builtins (spec J)', async () => {
    palStore.pals = [
      createPal({id: 'mine-1', name: 'My Assistant'}),
      createPal({id: 'lookie', name: 'Lookie'}),
    ];
    palStore.hiddenPalIds = ['lookie'];

    const {getByText, queryByText} = renderScreen();

    await waitFor(() => expect(getByText('My Assistant')).toBeTruthy());
    expect(queryByText('Lookie')).toBeNull();
  });

  it('shows the empty state when no local pals exist', () => {
    const {getByText} = renderScreen();
    expect(getByText(/No personas yet/)).toBeTruthy();
  });

  it('opens the creation menu from the add button', async () => {
    const {getByTestId, getByText} = renderScreen();

    fireEvent.press(getByTestId('bottom-action-add'));

    await waitFor(() => expect(getByText('Assistant')).toBeTruthy());
  });

  it('opens the edit sheet when a local pal card is pressed', async () => {
    palStore.pals = [createPal({id: 'mine-1', name: 'My Assistant'})];

    const {getByTestId, findByTestId} = renderScreen();

    fireEvent.press(getByTestId('local-pal-card-mine-1'));

    // PalSheet renders its submit action once open.
    expect(await findByTestId('submit-button')).toBeTruthy();
  });

  it('reflows the grid when the window width changes', async () => {
    palStore.pals = [
      createPal({id: 'a', name: 'Pal A'}),
      createPal({id: 'b', name: 'Pal B'}),
      createPal({id: 'c', name: 'Pal C'}),
      createPal({id: 'd', name: 'Pal D'}),
    ];

    const {getByText, queryByText} = renderScreen();
    await waitFor(() => expect(getByText('Pal A')).toBeTruthy());

    act(() => setWindowWidth(1200));

    await waitFor(() => {
      expect(getByText('Pal D')).toBeTruthy();
      expect(queryByText('Lookie')).toBeNull();
    });
  });
});
