import React from 'react';
import {runInAction} from 'mobx';

import {render} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';
import {l10n} from '../../../locales';
import {L10nContext} from '../../../utils';
import {uiStore} from '../../../store';
import {useTheme} from '../../../hooks/useTheme';

import {BicoMascot} from '../BicoMascot';

// jest/setup.ts pins useTheme to the light fixture globally (that file is
// read-only), so dark-surface tests swap the fixture return value here.
const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>;
const darkFixture = themeFixtures.darkTheme as unknown as ReturnType<
  typeof useTheme
>;

const HIDDEN = {includeHiddenElements: true};

const renderBico = (props: Record<string, unknown> = {}, lang = l10n.en) =>
  render(
    <L10nContext.Provider value={lang}>
      <BicoMascot {...props} />
    </L10nContext.Provider>,
  );

const testUriOf = (getByTestId: (id: string, opts?: any) => any) =>
  String(getByTestId('bico-mascot', HIDDEN).props.source.testUri);

describe('BicoMascot', () => {
  beforeEach(() => {
    mockUseTheme.mockReturnValue(themeFixtures.lightTheme as any);
    runInAction(() => {
      uiStore.colorScheme = 'light';
    });
  });

  afterEach(() => {
    mockUseTheme.mockReturnValue(themeFixtures.lightTheme as any);
    runInAction(() => {
      uiStore.colorScheme = 'light';
    });
  });

  const useDarkSurface = () => {
    mockUseTheme.mockReturnValue(darkFixture);
    runInAction(() => {
      uiStore.colorScheme = 'dark';
    });
  };

  it('renders the full-body hero on light surfaces by default', () => {
    const {getByTestId} = renderBico();
    expect(testUriOf(getByTestId)).toContain('bico-hero');
  });

  it('renders the round mark on dark surfaces', () => {
    useDarkSurface();
    const {getByTestId} = renderBico();
    expect(testUriOf(getByTestId)).toContain('bico-mark');
  });

  it('never renders the hero on dark surfaces, even when explicitly asked', () => {
    useDarkSurface();
    const {getByTestId} = renderBico({variant: 'hero'});
    expect(testUriOf(getByTestId)).toContain('bico-mark');
  });

  it('keeps the explicit mark on light surfaces too', () => {
    const {getByTestId} = renderBico({variant: 'mark'});
    expect(testUriOf(getByTestId)).toContain('bico-mark');
  });

  it('renders the mono template image', () => {
    const {getByTestId} = renderBico({variant: 'mono'});
    expect(testUriOf(getByTestId)).toContain('bico-mono');
  });

  it('is hidden from VoiceOver by default (decorative)', () => {
    const {queryByTestId, getByTestId} = renderBico();
    // Decorative by default: the standard query must NOT reach it, which
    // is exactly how VoiceOver treats it.
    expect(queryByTestId('bico-mascot')).toBeNull();
    const img = getByTestId('bico-mascot', HIDDEN);
    expect(img.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(img.props.accessibilityElementsHidden).toBe(true);
    expect(img.props.accessible).toBe(false);
  });

  it('announces the English mascot label when informative', () => {
    const {getByTestId} = renderBico({decorative: false});
    expect(getByTestId('bico-mascot').props.accessibilityLabel).toBe(
      l10n.en.bico.mascotLabel,
    );
    expect(l10n.en.bico.mascotLabel).toBe('Bico, the BotConnector mascot');
  });

  it('announces the Indonesian mascot label when informative', () => {
    const {getByTestId} = renderBico({decorative: false}, l10n.id);
    expect(getByTestId('bico-mascot').props.accessibilityLabel).toBe(
      l10n.id.bico.mascotLabel,
    );
    expect(l10n.id.bico.mascotLabel).toBe('Bico, maskot BotConnector');
  });
});
