import React from 'react';
import {Keyboard} from 'react-native';
import {Chip} from 'react-native-paper';

import {render, fireEvent, waitFor} from '../../../../jest/test-utils';
import {ImageGenerationScreen} from '../ImageGenerationScreen';

import {serverStore} from '../../../store';
import {l10n} from '../../../locales';
import {
  fetchBotConnectorImageModels,
  generateBotConnectorImage,
} from '../../../api/botconnectorMedia';

jest.mock('../../../api/botconnectorMedia', () => ({
  fetchBotConnectorImageModels: jest.fn(),
  generateBotConnectorImage: jest.fn(),
}));

// jest/setup.ts automocks NativeEventEmitter, so the real Keyboard.addListener
// hands back undefined and KeyboardAvoidingView (only used by this screen)
// crashes in componentWillUnmount during cleanup. Spy on the shared Keyboard
// object instead of jest.mock-ing the module: the module mock needs the
// `__esModule` dance to survive babel interop with the default import.
jest.spyOn(Keyboard, 'addListener').mockReturnValue({remove: jest.fn()} as any);

const BOTCONNECTOR_SERVER = {
  id: 'bc-server-1',
  name: 'BotConnector',
  url: 'https://api.botconnector.id',
} as any;

const IMAGE_MODELS = [
  {
    id: 'google/imagen-4',
    name: 'Imagen 4',
    developer: 'Google',
    category: 'image',
    botconnector_modality: 'image',
    botconnector_access: 'free',
    supports_reference_images: false,
  },
  {
    id: 'bfl/flux-1.1-pro',
    name: 'FLUX 1.1 Pro',
    developer: 'Black Forest Labs',
    category: 'image',
    botconnector_modality: 'image',
    botconnector_access: 'payg',
    supports_reference_images: true,
  },
];

const copy = l10n.en.imageGeneration;

const renderScreen = () => render(<ImageGenerationScreen />);

// The generate action is a paper Button: the host element it renders does not
// carry `disabled`/`loading`, so assert on the composite component props.
const getGenerateButton = (buttons: any[]) =>
  buttons.find(button => button.props.testID === 'generate-image-button');

describe('ImageGenerationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serverStore.servers = [BOTCONNECTOR_SERVER];
    (serverStore.getApiKey as jest.Mock).mockResolvedValue('bc_key_test');
    (fetchBotConnectorImageModels as jest.Mock).mockResolvedValue(IMAGE_MODELS);
  });

  describe('connect state', () => {
    it('asks to connect BotConnector when no account server exists', async () => {
      serverStore.servers = [];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue('');

      const {getByTestId, getByText} = renderScreen();

      expect(getByTestId('botconnector-account-card')).toBeTruthy();
      expect(getByText(copy.connectTitle)).toBeTruthy();
      expect(getByText(copy.connectBody)).toBeTruthy();
      // No account server → nothing is fetched.
      expect(fetchBotConnectorImageModels).not.toHaveBeenCalled();
    });
  });

  describe('signed-in layout', () => {
    it('renders a compact selector, prompt and primary action', async () => {
      const {getByTestId, getByText, queryByText} = renderScreen();

      await waitFor(() =>
        expect(fetchBotConnectorImageModels).toHaveBeenCalledWith({
          serverUrl: 'https://api.botconnector.id',
          apiKey: 'bc_key_test',
        }),
      );

      // Account/plan status is compact, quota stays server-side.
      expect(getByTestId('botconnector-account-card')).toBeTruthy();

      // Model selector: one artwork + one compact dropdown.
      expect(getByTestId('model-artwork')).toBeTruthy();
      expect(getByTestId('image-model-dropdown').props.accessibilityLabel).toBe(
        copy.model,
      );
      expect(getByText('Imagen 4')).toBeTruthy();
      expect(getByText('Google · Free')).toBeTruthy();

      // Prompt + reference flow + primary action are all reachable.
      expect(getByTestId('image-prompt-input')).toBeTruthy();
      expect(getByText(copy.reference)).toBeTruthy();
      expect(getByTestId('generate-image-button')).toBeTruthy();

      // The old wall-of-text intro paragraph is gone.
      expect(
        queryByText(/Free, plan, and PAYG access are enforced/),
      ).toBeNull();
    });

    it('does not render giant single-letter avatars or badge chips', async () => {
      const {UNSAFE_queryAllByType, UNSAFE_root, getByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('image-model-dropdown')).toBeTruthy(),
      );

      // Spec I: no giant Q/V-style letter fallback anywhere on the screen.
      const giantLetters = UNSAFE_root.findAll(
        node =>
          typeof node.props?.children === 'string' &&
          /^[A-Z]$/.test(node.props.children),
      );
      expect(giantLetters).toHaveLength(0);

      // Spec L: access/capability badges collapsed into the meta line.
      expect(UNSAFE_queryAllByType(Chip)).toHaveLength(0);
    });

    it('shows the model loading state while models are in flight', async () => {
      (fetchBotConnectorImageModels as jest.Mock).mockReturnValue(
        new Promise(() => undefined),
      );

      const {getByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('image-models-loading')).toBeTruthy(),
      );
      expect(getByTestId('image-prompt-input')).toBeTruthy();
    });

    it('shows an empty state when the account has no image models', async () => {
      (fetchBotConnectorImageModels as jest.Mock).mockResolvedValue([]);

      const {getByText, queryByTestId} = renderScreen();

      await waitFor(() => expect(getByText(copy.modelEmpty)).toBeTruthy());
      expect(queryByTestId('image-model-dropdown')).toBeNull();
      expect(getByText(copy.retry)).toBeTruthy();
    });

    it('surfaces load failures as an inline error state', async () => {
      (fetchBotConnectorImageModels as jest.Mock).mockRejectedValue(
        new Error('media endpoint down'),
      );

      const {getByTestId, getByText} = renderScreen();

      await waitFor(() => expect(getByTestId('image-error')).toBeTruthy());
      expect(getByText('media endpoint down')).toBeTruthy();
    });
  });

  describe('reference photos', () => {
    it('explains that the selected model has no reference support', async () => {
      const {getByText} = renderScreen();

      await waitFor(() => expect(getByText(copy.reference)).toBeTruthy());
      expect(getByText(copy.referenceUnsupported)).toBeTruthy();
    });

    it('keeps the hint short for reference-capable models', async () => {
      (fetchBotConnectorImageModels as jest.Mock).mockResolvedValue([
        IMAGE_MODELS[1],
      ]);

      const {getByText} = renderScreen();

      await waitFor(() => expect(getByText(copy.referenceHint)).toBeTruthy());
      expect(getByText('FLUX 1.1 Pro')).toBeTruthy();
      expect(getByText('Black Forest Labs · PAYG')).toBeTruthy();
    });
  });

  describe('generate flow', () => {
    it('keeps the generate action disabled until a prompt exists', async () => {
      const {getByTestId, UNSAFE_queryAllByType} = renderScreen();
      const buttons = () =>
        UNSAFE_queryAllByType(require('react-native-paper').Button);

      await waitFor(() =>
        expect(getGenerateButton(buttons())?.props.disabled).toBe(true),
      );

      fireEvent.changeText(
        getByTestId('image-prompt-input'),
        'a clean product photo',
      );

      expect(getGenerateButton(buttons())?.props.disabled).toBe(false);
    });

    it('generates and renders a compact result card with quota and share', async () => {
      (generateBotConnectorImage as jest.Mock).mockResolvedValue({
        b64: 'aGVsbG8=',
        mimeType: 'image/png',
        access: 'free',
        quotaRemaining: 3,
        quotaLimit: 10,
      });

      const {getByTestId, getByText} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );

      fireEvent.changeText(getByTestId('image-prompt-input'), 'a red cube');
      fireEvent.press(getByTestId('generate-image-button'));

      await waitFor(() =>
        expect(generateBotConnectorImage).toHaveBeenCalledWith(
          expect.objectContaining({
            serverUrl: 'https://api.botconnector.id',
            apiKey: 'bc_key_test',
            model: 'google/imagen-4',
            prompt: 'a red cube',
          }),
        ),
      );

      await waitFor(() => expect(getByTestId('generated-image')).toBeTruthy());
      expect(getByText('Generated image · Free')).toBeTruthy();
      expect(getByText('Quota remaining: 3/10')).toBeTruthy();
      expect(
        getByTestId('share-generated-image').props.accessibilityLabel,
      ).toBe(copy.share);
    });

    it('shows generation failures in the error state', async () => {
      (generateBotConnectorImage as jest.Mock).mockRejectedValue(
        new Error('quota exceeded'),
      );

      const {getByTestId, getByText, UNSAFE_queryAllByType} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );

      fireEvent.changeText(getByTestId('image-prompt-input'), 'a red cube');
      fireEvent.press(getByTestId('generate-image-button'));

      await waitFor(() => expect(getByTestId('image-error')).toBeTruthy());
      expect(getByText('quota exceeded')).toBeTruthy();

      // The loading spinner is cleared after the failure.
      const generateButton = getGenerateButton(
        UNSAFE_queryAllByType(require('react-native-paper').Button),
      );
      expect(generateButton?.props.loading).toBe(false);
      expect(generateButton?.props.disabled).toBe(false);
    });
  });
});
