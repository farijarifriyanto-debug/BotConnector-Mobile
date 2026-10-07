import React from 'react';

import {render, fireEvent, waitFor} from '../../../../jest/test-utils';
import {l10n, t} from '../../../locales';
import {L10nContext} from '../../../utils';
import {AddProviderSheet} from '../AddProviderSheet';
import {byokProviderStore} from '../../../store/ByokProviderStore';
import {ByokApiError, fetchByokModels} from '../../../api/byokProviders';

// Render the Sheet body inline so the flow fields are reachable.
jest.mock('../../Sheet/Sheet', () => {
  const {View} = require('react-native');
  const MockSheet = ({children, isVisible, title}: any) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children}: any) => <View>{children}</View>;
  MockSheet.Actions = ({children}: any) => <View>{children}</View>;
  return {Sheet: MockSheet};
});

jest.mock('../../../store/ByokProviderStore', () => ({
  byokProviderStore: {
    providers: [],
    getConfig: jest.fn(),
    getKey: jest.fn(),
    hasKey: jest.fn(),
    saveProvider: jest.fn(),
    removeProvider: jest.fn(),
  },
}));

jest.mock('../../../api/byokProviders', () => {
  const actual = jest.requireActual('../../../api/byokProviders');
  return {
    ...actual,
    fetchByokModels: jest.fn(),
  };
});

const strings = l10n.en.components.addProvider;

const fetchMock = fetchByokModels as jest.Mock;
const getConfigMock = byokProviderStore.getConfig as jest.Mock;
const getKeyMock = byokProviderStore.getKey as jest.Mock;
const saveMock = byokProviderStore.saveProvider as jest.Mock;
const removeMock = byokProviderStore.removeProvider as jest.Mock;

const renderSheet = (props: Record<string, unknown> = {}) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <AddProviderSheet isVisible onDismiss={jest.fn()} {...props} />
    </L10nContext.Provider>,
  );

describe('AddProviderSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (byokProviderStore as any).providers = [];
    getConfigMock.mockReturnValue(undefined);
    getKeyMock.mockReturnValue('');
    saveMock.mockResolvedValue(true);
    removeMock.mockResolvedValue(true);
  });

  describe('provider selection', () => {
    it('lists every supported provider before asking for a key', () => {
      const {getByTestId, queryByTestId} = renderSheet();

      for (const id of [
        'openai',
        'anthropic',
        'gemini',
        'deepseek',
        'openrouter',
        'generic',
      ]) {
        expect(getByTestId(`byok-provider-option-${id}`)).toBeTruthy();
      }

      expect(queryByTestId('byok-key-input')).toBeNull();
      expect(queryByTestId('byok-test-button')).toBeNull();
    });

    it('shows the key step with the official default base URL for OpenAI', () => {
      const {getByTestId, queryByTestId, getByText} = renderSheet();

      fireEvent.press(getByTestId('byok-provider-option-openai'));

      expect(getByTestId('byok-key-input')).toBeTruthy();
      expect(queryByTestId('byok-baseurl-input')).toBeNull();
      expect(getByText(/Default: https:\/\/api\.openai\.com\/v1/)).toBeTruthy();
    });

    it('asks a generic provider for its own base URL', () => {
      const {getByTestId} = renderSheet();

      fireEvent.press(getByTestId('byok-provider-option-generic'));

      expect(getByTestId('byok-baseurl-input')).toBeTruthy();
      expect(getByTestId('byok-key-input')).toBeTruthy();
    });
  });

  describe('test connection', () => {
    it('asks for an API key before contacting the provider', async () => {
      const {getByTestId} = renderSheet();
      fireEvent.press(getByTestId('byok-provider-option-openai'));

      fireEvent.press(getByTestId('byok-test-button'));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(getByTestId('byok-test-error').props.children).toBe(
        strings.errorMissingKey,
      );
    });

    it('blocks a generic request until a base URL is entered', async () => {
      const {getByTestId} = renderSheet();
      fireEvent.press(getByTestId('byok-provider-option-generic'));
      fireEvent.changeText(getByTestId('byok-key-input'), 'sk-local');

      fireEvent.press(getByTestId('byok-test-button'));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(getByTestId('byok-test-error').props.children).toBe(
        strings.errorMissingBaseUrl,
      );
    });

    it('reports an invalid key with a localized message and saves nothing', async () => {
      fetchMock.mockRejectedValueOnce(
        new ByokApiError('invalidKey', 'Unauthorized', 401),
      );

      const {getByTestId} = renderSheet();
      fireEvent.press(getByTestId('byok-provider-option-openai'));
      fireEvent.changeText(getByTestId('byok-key-input'), 'sk-invalid');
      fireEvent.press(getByTestId('byok-test-button'));

      await waitFor(() => {
        expect(getByTestId('byok-test-error').props.children).toBe(
          strings.errorInvalidKey,
        );
      });
      expect(
        getByTestId('byok-save-button').props.accessibilityState?.disabled,
      ).toBe(true);
      expect(saveMock).not.toHaveBeenCalled();
    });

    it('maps an unreachable network to a localized message', async () => {
      fetchMock.mockRejectedValueOnce(
        new ByokApiError('network', 'Could not connect'),
      );

      const {getByTestId} = renderSheet();
      fireEvent.press(getByTestId('byok-provider-option-openrouter'));
      fireEvent.changeText(getByTestId('byok-key-input'), 'or-key');
      fireEvent.press(getByTestId('byok-test-button'));

      await waitFor(() => {
        expect(getByTestId('byok-test-error').props.children).toBe(
          strings.errorNetwork,
        );
      });
    });

    it('fetches the model list for the chosen provider with the pasted key', async () => {
      fetchMock.mockResolvedValueOnce([{id: 'gpt-a'}, {id: 'gpt-b'}]);

      const {getByTestId} = renderSheet();
      fireEvent.press(getByTestId('byok-provider-option-openai'));
      fireEvent.changeText(getByTestId('byok-key-input'), 'sk-good');
      fireEvent.press(getByTestId('byok-test-button'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('openai', {
          apiKey: 'sk-good',
          baseUrl: undefined,
        });
      });
      expect(getByTestId('byok-test-success').props.children).toBe(
        t(strings.testSuccess, {count: 2}),
      );
      expect(getByTestId('byok-model-gpt-a')).toBeTruthy();
      expect(getByTestId('byok-model-gpt-b')).toBeTruthy();
    });

    it('passes the custom base URL through for a generic provider', async () => {
      fetchMock.mockResolvedValueOnce([{id: 'local-model'}]);

      const {getByTestId} = renderSheet();
      fireEvent.press(getByTestId('byok-provider-option-generic'));
      fireEvent.changeText(
        getByTestId('byok-baseurl-input'),
        'https://my.host/v1',
      );
      fireEvent.changeText(getByTestId('byok-key-input'), 'k');
      fireEvent.press(getByTestId('byok-test-button'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('generic', {
          apiKey: 'k',
          baseUrl: 'https://my.host/v1',
        });
      });
    });

    it('shows an explicit empty state when the provider returns no models', async () => {
      fetchMock.mockResolvedValueOnce([]);

      const {getByTestId} = renderSheet();
      fireEvent.press(getByTestId('byok-provider-option-openai'));
      fireEvent.changeText(getByTestId('byok-key-input'), 'sk-good');
      fireEvent.press(getByTestId('byok-test-button'));

      await waitFor(() => {
        expect(getByTestId('byok-no-models')).toBeTruthy();
      });
      expect(
        getByTestId('byok-save-button').props.accessibilityState?.disabled,
      ).toBe(true);
    });
  });

  describe('save credential', () => {
    const setupValidConnection = async (
      view: ReturnType<typeof renderSheet>,
      models: Array<{id: string}> = [{id: 'gpt-a'}, {id: 'gpt-b'}],
    ) => {
      fetchMock.mockResolvedValueOnce(models);
      fireEvent.press(view.getByTestId('byok-provider-option-openai'));
      fireEvent.changeText(view.getByTestId('byok-key-input'), 'sk-good');
      fireEvent.press(view.getByTestId('byok-test-button'));
      await waitFor(() => {
        expect(view.getByTestId('byok-test-success')).toBeTruthy();
      });
    };

    it('stays disabled until at least one model is picked', async () => {
      const view = renderSheet();
      await setupValidConnection(view);

      expect(
        view.getByTestId('byok-save-button').props.accessibilityState?.disabled,
      ).toBe(true);
      expect(saveMock).not.toHaveBeenCalled();
    });

    it('stores the key and the selection for the chosen provider', async () => {
      const onSaved = jest.fn();
      const onDismiss = jest.fn();
      const view = renderSheet({onSaved, onDismiss});
      await setupValidConnection(view);

      fireEvent.press(view.getByTestId('byok-model-gpt-a'));
      fireEvent.press(view.getByTestId('byok-save-button'));

      await waitFor(() => {
        expect(saveMock).toHaveBeenCalledWith(
          {
            providerId: 'openai',
            baseUrl: '',
            selectedModels: ['gpt-a'],
          },
          'sk-good',
        );
      });
      expect(onSaved).toHaveBeenCalledWith('openai');
      expect(onDismiss).toHaveBeenCalled();
    });

    it('keeps the custom base URL together with the selection', async () => {
      fetchMock.mockResolvedValueOnce([{id: 'local-model'}]);

      const view = renderSheet();
      fireEvent.press(view.getByTestId('byok-provider-option-generic'));
      fireEvent.changeText(
        view.getByTestId('byok-baseurl-input'),
        'https://my.host/v1',
      );
      fireEvent.changeText(view.getByTestId('byok-key-input'), 'k');
      fireEvent.press(view.getByTestId('byok-test-button'));
      await waitFor(() => {
        expect(view.getByTestId('byok-test-success')).toBeTruthy();
      });
      // A sole model is preselected (same as RemoteModelSheet), so no tap
      // is needed before saving.
      expect(view.getByTestId('byok-model-local-model')).toBeTruthy();
      expect(
        view.getByTestId('byok-model-local-model').props.accessibilityState
          ?.checked,
      ).toBe(true);

      fireEvent.press(view.getByTestId('byok-save-button'));

      await waitFor(() => {
        expect(saveMock).toHaveBeenCalledWith(
          {
            providerId: 'generic',
            baseUrl: 'https://my.host/v1',
            selectedModels: ['local-model'],
          },
          'k',
        );
      });
    });

    it('surfaces a save failure instead of dismissing', async () => {
      saveMock.mockResolvedValueOnce(false);
      const onDismiss = jest.fn();
      const view = renderSheet({onDismiss});
      await setupValidConnection(view);

      fireEvent.press(view.getByTestId('byok-model-gpt-a'));
      fireEvent.press(view.getByTestId('byok-save-button'));

      await waitFor(() => {
        expect(view.getByTestId('byok-save-error')).toBeTruthy();
      });
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('remove credential', () => {
    it('offers removal for a configured provider and clears the credential', async () => {
      getConfigMock.mockReturnValue({
        providerId: 'openai',
        baseUrl: '',
        selectedModels: ['gpt-a'],
        createdAt: 1,
      });
      getKeyMock.mockReturnValue('sk-saved');
      const onDismiss = jest.fn();

      const view = renderSheet({onDismiss});
      fireEvent.press(view.getByTestId('byok-provider-option-openai'));

      expect(view.getByTestId('byok-remove-button')).toBeTruthy();
      // Editing starts from the stored key, never a blank field.
      expect(view.getByTestId('byok-key-input').props.value).toBe('sk-saved');

      fireEvent.press(view.getByTestId('byok-remove-button'));

      await waitFor(() => {
        expect(removeMock).toHaveBeenCalledWith('openai');
      });
      expect(onDismiss).toHaveBeenCalled();
    });

    it('offers no removal entry for a provider that was never saved', () => {
      const view = renderSheet();
      fireEvent.press(view.getByTestId('byok-provider-option-openai'));

      expect(view.queryByTestId('byok-remove-button')).toBeNull();
    });
  });
});
