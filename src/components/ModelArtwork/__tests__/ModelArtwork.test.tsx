import React from 'react';
import {Text} from 'react-native';

import {render} from '../../../../jest/test-utils';

import {ModelArtwork} from '../ModelArtwork';

// The shared `.svg` mock maps every icon to the same 'SvgMock' host element,
// so provider logos would be indistinguishable. Mock the icon barrel with two
// distinct components to prove which one the artwork slot picks.
jest.mock('../../../assets/icons', () => ({
  AtomIcon: () => null,
  GoogleIcon: () => null,
}));

const icons = require('../../../assets/icons');

describe('ModelArtwork', () => {
  it('renders the provider logo when registry metadata matches', () => {
    const {UNSAFE_queryByType, getByTestId} = render(
      <ModelArtwork metadata={{provider: 'Google'}} />,
    );

    expect(UNSAFE_queryByType(icons.GoogleIcon)).toBeTruthy();
    expect(UNSAFE_queryByType(icons.AtomIcon)).toBeNull();
    expect(getByTestId('model-artwork').props.accessibilityLabel).toBe(
      'Google logo',
    );
  });

  it('falls back to the generic AI icon for unknown providers', () => {
    const {UNSAFE_queryByType, getByTestId} = render(
      <ModelArtwork metadata={{provider: 'Some Unknown Labs'}} />,
    );

    expect(UNSAFE_queryByType(icons.AtomIcon)).toBeTruthy();
    expect(UNSAFE_queryByType(icons.GoogleIcon)).toBeNull();
    expect(getByTestId('model-artwork').props.accessibilityLabel).toBe(
      'AI artwork',
    );
  });

  it('never renders a giant letter for Q/V style model names', () => {
    const {UNSAFE_queryAllByType, queryByText} = render(
      <>
        <ModelArtwork metadata={{name: 'Qwen3 30B'}} />
        <ModelArtwork metadata={{name: 'Voxtral Mini'}} />
      </>,
    );

    // Structural guarantee: the artwork slot contains no text nodes at all.
    expect(UNSAFE_queryAllByType(Text)).toHaveLength(0);
    expect(queryByText('Q')).toBeNull();
    expect(queryByText('V')).toBeNull();
  });

  it('honours an explicit accessibility label', () => {
    const {getByTestId} = render(
      <ModelArtwork
        metadata={{provider: 'Google'}}
        accessibilityLabel="Imagen 4 artwork"
      />,
    );

    expect(getByTestId('model-artwork').props.accessibilityLabel).toBe(
      'Imagen 4 artwork',
    );
  });

  it('applies the requested square size', () => {
    const {getByTestId} = render(
      <ModelArtwork metadata={null} size={40} testID="pal-artwork-x" />,
    );

    const style = getByTestId('pal-artwork-x').props.style;
    const flat = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : style;
    expect(flat.width).toBe(40);
    expect(flat.height).toBe(40);
  });
});
