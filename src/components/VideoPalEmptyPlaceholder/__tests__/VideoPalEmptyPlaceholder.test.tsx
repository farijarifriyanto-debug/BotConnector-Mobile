import React from 'react';

import {render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {L10nContext} from '../../../utils';

import {VideoPalEmptyPlaceholder} from '../VideoPalEmptyPlaceholder';

describe('VideoPalEmptyPlaceholder', () => {
  it('shows Bico instead of the legacy PocketPal logo', () => {
    const {queryByTestId, getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <VideoPalEmptyPlaceholder bottomComponentHeight={0} />
      </L10nContext.Provider>,
    );

    expect(queryByTestId('bico-mascot')).toBeNull();
    const mascot = getByTestId('bico-mascot', {includeHiddenElements: true});
    expect(mascot.props.source.testUri).toContain('bico-');
    expect(mascot.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
