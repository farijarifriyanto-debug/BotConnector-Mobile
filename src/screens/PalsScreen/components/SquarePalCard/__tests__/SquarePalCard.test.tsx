import React from 'react';
import {Alert} from 'react-native';
import {render, fireEvent} from '../../../../../../jest/test-utils';

import {SquarePalCard} from '../SquarePalCard';
import {palStore, chatSessionStore} from '../../../../../store';
import {createPal} from '../../../../../../jest/fixtures/pals';

jest.spyOn(Alert, 'alert');

describe('SquarePalCard', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the local pal name', () => {
    const pal = createPal({id: 'p1', name: 'Local Buddy'});
    const {getByText} = render(
      <SquarePalCard pal={pal} onPress={mockOnPress} />,
      {withNavigation: true},
    );

    expect(getByText('Local Buddy')).toBeTruthy();
  });

  it('calls onPress when the card body is tapped', () => {
    const pal = createPal({id: 'p1'});
    const {getByTestId} = render(
      <SquarePalCard pal={pal} onPress={mockOnPress} />,
      {withNavigation: true},
    );

    fireEvent.press(getByTestId('local-pal-card-p1'));

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('activates the pal from the chat affordance', async () => {
    const pal = createPal({id: 'p1', name: 'Chatty'});
    const {getByLabelText} = render(
      <SquarePalCard pal={pal} onPress={mockOnPress} />,
      {withNavigation: true},
    );

    fireEvent.press(getByLabelText('Chat with Chatty'));

    expect(chatSessionStore.setActivePal).toHaveBeenCalledWith('p1');
  });

  it('asks before deleting a local pal', () => {
    const pal = createPal({id: 'p1', name: 'Doomed'});
    const {getByLabelText} = render(
      <SquarePalCard pal={pal} onPress={mockOnPress} />,
      {withNavigation: true},
    );

    fireEvent.press(getByLabelText(`Delete Doomed`));
    // The alert must be the confirmation, and nothing is deleted before
    // confirming.
    expect(Alert.alert).toHaveBeenCalled();
    expect(palStore.deletePal).not.toHaveBeenCalled();
  });
});
