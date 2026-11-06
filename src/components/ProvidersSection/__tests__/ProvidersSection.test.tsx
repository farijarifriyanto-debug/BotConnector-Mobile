import React from 'react';

import {render, fireEvent} from '../../../../jest/test-utils';
import {l10n, t} from '../../../locales';
import {L10nContext} from '../../../utils';
import {ProvidersSection} from '../ProvidersSection';
import {byokProviderStore} from '../../../store/ByokProviderStore';

// The sheet is a separate component with its own suite; here it only has to
// report which provider it was opened for.
jest.mock('../../AddProviderSheet', () => {
  const {Text} = require('react-native');
  return {
    AddProviderSheet: ({
      isVisible,
      initialProviderId,
    }: {
      isVisible: boolean;
      initialProviderId?: string;
    }) =>
      isVisible ? (
        <Text testID="add-provider-sheet">{initialProviderId ?? 'blank'}</Text>
      ) : null,
  };
});

jest.mock('../../../store/ByokProviderStore', () => ({
  byokProviderStore: {
    providers: [],
  },
}));

const strings = l10n.en.settings.providersSection;

const setProviders = (providers: Array<Record<string, unknown>>) => {
  (byokProviderStore as any).providers = providers;
};

const renderSection = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <ProvidersSection />
    </L10nContext.Provider>,
  );

describe('ProvidersSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setProviders([]);
  });

  it('lists saved providers with their label and model count', () => {
    setProviders([
      {
        providerId: 'openai',
        baseUrl: '',
        selectedModels: ['gpt-a', 'gpt-b'],
        createdAt: 1,
      },
      {
        providerId: 'anthropic',
        baseUrl: '',
        selectedModels: ['claude-a'],
        createdAt: 2,
      },
    ]);

    const {getByText, getByTestId} = renderSection();

    expect(getByText('OpenAI')).toBeTruthy();
    expect(getByText(t(strings.modelCount, {count: 2}))).toBeTruthy();
    expect(getByText('Anthropic')).toBeTruthy();
    expect(getByTestId('provider-row-anthropic')).toBeTruthy();
  });

  it('opens the sheet for the tapped provider', () => {
    setProviders([
      {
        providerId: 'openai',
        baseUrl: '',
        selectedModels: ['gpt-a'],
        createdAt: 1,
      },
    ]);

    const {getByTestId, queryByTestId} = renderSection();
    expect(queryByTestId('add-provider-sheet')).toBeNull();

    fireEvent.press(getByTestId('provider-row-openai'));

    expect(getByTestId('add-provider-sheet').props.children).toBe('openai');
  });

  it('opens a blank sheet from the Add provider row', () => {
    const {getByTestId} = renderSection();

    fireEvent.press(getByTestId('provider-add-row'));

    expect(getByTestId('add-provider-sheet').props.children).toBe('blank');
  });

  it('shows the empty hint when no provider is configured', () => {
    const {getByText} = renderSection();

    expect(getByText(strings.empty)).toBeTruthy();
  });
});
