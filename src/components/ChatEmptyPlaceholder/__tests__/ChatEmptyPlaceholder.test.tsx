import React from 'react';
import {runInAction} from 'mobx';

import {render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {L10nContext} from '../../../utils';
import {modelStore} from '../../../store';

import {ChatEmptyPlaceholder} from '../ChatEmptyPlaceholder';

describe('ChatEmptyPlaceholder', () => {
  beforeEach(() => {
    runInAction(() => {
      modelStore.activeModelId = undefined;
    });
  });

  it('shows Bico instead of the legacy PocketPal logo', () => {
    const {queryByTestId, getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <ChatEmptyPlaceholder
          onSelectModel={jest.fn()}
          bottomComponentHeight={0}
        />
      </L10nContext.Provider>,
      {withNavigation: true},
    );

    // Decorative: outside the VoiceOver tree by default...
    expect(queryByTestId('bico-mascot')).toBeNull();
    // ...but present for sighted users.
    const mascot = getByTestId('bico-mascot', {includeHiddenElements: true});
    expect(mascot.props.source.testUri).toContain('bico-');
    expect(mascot.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
