import React from 'react';
import {Alert, Keyboard} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {render, fireEvent, waitFor, act} from '../../../../jest/test-utils';
import {ImageGenerationScreen} from '../ImageGenerationScreen';

import {serverStore} from '../../../store';
import {l10n} from '../../../locales';
import {
  BotConnectorImageError,
  fetchBotConnectorImageModels,
  generateBotConnectorImage,
} from '../../../api/botconnectorMedia';

jest.mock('../../../api/botconnectorMedia', () => ({
  // Keep the real class/helpers so instanceof checks in the screen work;
  // only the network edges are mocked.
  ...jest.requireActual('../../../api/botconnectorMedia'),
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

const GENERATION_OK = {
  b64: 'aGVsbG8=',
  mimeType: 'image/png',
  access: 'free',
  quota: {tier: 'free', remaining: 3, limit: 10, period: 'day'},
};

const LAST_QUOTA_KEY = 'botconnector.imageLastQuota.v1';

describe('ImageGenerationScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (RNFS as any).__resetMockState?.();
    serverStore.servers = [BOTCONNECTOR_SERVER];
    (serverStore.getApiKey as jest.Mock).mockResolvedValue('bc_key_test');
    (fetchBotConnectorImageModels as jest.Mock).mockResolvedValue(IMAGE_MODELS);
    (generateBotConnectorImage as jest.Mock).mockResolvedValue(GENERATION_OK);
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
      // Developer meta + access badge (Free/Included/PAYG) as its own chip.
      expect(getByText('Google')).toBeTruthy();
      expect(getByTestId('image-access-badge')).toBeTruthy();
      expect(getByText(copy.access.free)).toBeTruthy();

      // Prompt + reference flow + primary action are all reachable.
      expect(getByTestId('image-prompt-input')).toBeTruthy();
      expect(getByText(copy.reference)).toBeTruthy();
      expect(getByTestId('generate-image-button')).toBeTruthy();

      // The old wall-of-text intro paragraph is gone.
      expect(
        queryByText(/Free, plan, and PAYG access are enforced/),
      ).toBeNull();
    });

    it('does not render giant single-letter avatars', async () => {
      const {UNSAFE_root, getByTestId} = renderScreen();

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

    it('surfaces load failures with a local message, never server text', async () => {
      (fetchBotConnectorImageModels as jest.Mock).mockRejectedValue(
        new Error('media endpoint down'),
      );

      const {getByTestId, getByText, queryByText} = renderScreen();

      await waitFor(() => expect(getByTestId('image-error')).toBeTruthy());
      expect(getByText(copy.errorLoadModels)).toBeTruthy();
      expect(queryByText('media endpoint down')).toBeNull();
    });

    it('maps a 401 model-load failure to the sign-in message', async () => {
      (fetchBotConnectorImageModels as jest.Mock).mockRejectedValue(
        new BotConnectorImageError('unauthorized', {statusCode: 401}),
      );

      const {getByText} = renderScreen();

      await waitFor(() =>
        expect(getByText(copy.errors.unauthorized)).toBeTruthy(),
      );
    });
  });

  describe('size picker', () => {
    it('offers the three aspect ratios from i18n', async () => {
      const {getByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('size-ratio-square')).toBeTruthy(),
      );
      expect(getByTestId('size-ratio-landscape')).toBeTruthy();
      expect(getByTestId('size-ratio-portrait')).toBeTruthy();
      expect(getByTestId('size-ratio-square').props.accessibilityLabel).toBe(
        copy.size.square,
      );
    });

    it('sends 1536x1024 when Landscape is chosen', async () => {
      const {getByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('image-prompt-input')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'a wide scene');
      fireEvent.press(getByTestId('size-ratio-landscape'));
      fireEvent.press(getByTestId('generate-image-button'));

      await waitFor(() =>
        expect(generateBotConnectorImage).toHaveBeenCalledWith(
          expect.objectContaining({size: '1536x1024'}),
        ),
      );
    });

    it('falls back to auto for sizes the model does not allow', async () => {
      (fetchBotConnectorImageModels as jest.Mock).mockResolvedValue([
        {
          ...IMAGE_MODELS[1],
          id: 'bfl/flux-schnell',
          name: 'FLUX.1 [schnell]',
          botconnector_sizes: ['auto', '1024x1024'],
        },
      ]);

      const {getByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('image-prompt-input')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'fast');
      fireEvent.press(getByTestId('size-ratio-landscape'));
      fireEvent.press(getByTestId('generate-image-button'));

      await waitFor(() =>
        expect(generateBotConnectorImage).toHaveBeenCalledWith(
          expect.objectContaining({size: 'auto'}),
        ),
      );
    });

    it('disables ratios the model cannot produce at all', async () => {
      (fetchBotConnectorImageModels as jest.Mock).mockResolvedValue([
        {
          ...IMAGE_MODELS[1],
          botconnector_sizes: ['1024x1536'],
        },
      ]);

      const {getByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('size-ratio-portrait')).toBeTruthy(),
      );
      const disabled = (id: string) =>
        getByTestId(id).props.accessibilityState?.disabled;
      expect(disabled('size-ratio-square')).toBe(true);
      expect(disabled('size-ratio-landscape')).toBe(true);
      expect(disabled('size-ratio-portrait')).toBe(false);
    });
  });

  describe('prompt examples and length', () => {
    it('fills an empty prompt from an example chip', async () => {
      const {getByTestId} = renderScreen();

      await waitFor(() => expect(getByTestId('image-example-0')).toBeTruthy());
      expect(getByTestId('image-example-1')).toBeTruthy();

      fireEvent.press(getByTestId('image-example-0'));

      expect(getByTestId('image-prompt-input').props.value).toBe(
        copy.examples.product,
      );
    });

    it('appends an example to an existing prompt', async () => {
      const {getByTestId} = renderScreen();

      await waitFor(() => expect(getByTestId('image-example-0')).toBeTruthy());
      fireEvent.changeText(getByTestId('image-prompt-input'), 'a red cube');
      fireEvent.press(getByTestId('image-example-1'));

      expect(getByTestId('image-prompt-input').props.value).toBe(
        `a red cube, ${copy.examples.scenic}`,
      );
    });

    it('counts prompt characters', async () => {
      const {getByTestId, getByText, queryByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('image-prompt-input')).toBeTruthy(),
      );
      // Hidden while the prompt is empty.
      expect(queryByTestId('image-prompt-count')).toBeNull();

      fireEvent.changeText(getByTestId('image-prompt-input'), 'abcd');
      expect(getByTestId('image-prompt-count')).toBeTruthy();
      expect(getByText(t4(copy.promptCount, 4))).toBeTruthy();
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

      const {getByText, getByTestId} = renderScreen();

      await waitFor(() => expect(getByText(copy.referenceHint)).toBeTruthy());
      expect(getByText('FLUX 1.1 Pro')).toBeTruthy();
      expect(getByText('Black Forest Labs')).toBeTruthy();
      expect(getByTestId('image-access-badge')).toBeTruthy();
      expect(getByText(copy.access.payg)).toBeTruthy();
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

    it('generates, saves to history and renders the result with quota', async () => {
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
            size: '1024x1024',
            signal: expect.any(AbortSignal),
          }),
        ),
      );

      await waitFor(() => expect(getByTestId('generated-image')).toBeTruthy());
      expect(getByText('Generated image · Free')).toBeTruthy();
      // Result footer + persistent quota line both show the image_quota data.
      expect(getByText('Quota remaining: 3/10')).toBeTruthy();
      const quotaLineChildren = getByTestId('image-quota-line').props.children;
      const quotaLineText = Array.isArray(quotaLineChildren)
        ? quotaLineChildren.join('')
        : String(quotaLineChildren);
      expect(quotaLineText).toContain('3/10');
      expect(
        getByTestId('share-generated-image').props.accessibilityLabel,
      ).toBe(copy.share);
      expect(getByTestId('save-generated-image').props.accessibilityLabel).toBe(
        copy.save.action,
      );
      // The generated image is filed into the local history strip.
      await waitFor(() =>
        expect(getByTestId('image-history-list')).toBeTruthy(),
      );
    });

    it('restores the last known quota line on mount', async () => {
      await AsyncStorage.setItem(
        LAST_QUOTA_KEY,
        JSON.stringify({tier: 'free', remaining: 7, limit: 10, period: 'day'}),
      );

      const {getByTestId, getByText} = renderScreen();

      await waitFor(() => expect(getByTestId('image-quota-line')).toBeTruthy());
      expect(getByText(/7\/10/)).toBeTruthy();
    });

    it('offers Cancel while generating and stops silently on abort', async () => {
      (generateBotConnectorImage as jest.Mock).mockImplementation(
        (options: {signal: AbortSignal}) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () =>
              reject(new BotConnectorImageError('aborted')),
            );
          }),
      );

      const {getByTestId, queryByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'slow image');
      fireEvent.press(getByTestId('generate-image-button'));

      await waitFor(() =>
        expect(getByTestId('cancel-generate-button')).toBeTruthy(),
      );
      expect(getByTestId('image-generating-progress')).toBeTruthy();

      // The abort rejection settles asynchronously; keep it inside act so
      // setGenerating(false) flushes before we assert.
      await act(async () => {
        fireEvent.press(getByTestId('cancel-generate-button'));
      });

      // Silent: no error banner, and the generate action comes back.
      expect(getByTestId('generate-image-button')).toBeTruthy();
      expect(queryByTestId('image-error')).toBeNull();
      expect(queryByTestId('cancel-generate-button')).toBeNull();
    });

    it('maps quota exhaustion to a friendly local message', async () => {
      (generateBotConnectorImage as jest.Mock).mockRejectedValue(
        new BotConnectorImageError('quota_exhausted', {statusCode: 429}),
      );

      const {getByTestId, getByText, queryByText} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'a red cube');
      fireEvent.press(getByTestId('generate-image-button'));

      await waitFor(() => expect(getByTestId('image-error')).toBeTruthy());
      expect(getByText(copy.errors.quotaExhausted)).toBeTruthy();
      expect(queryByText(/quota_exhausted/)).toBeNull();
    });

    it('shows Retry-After seconds for rate limiting', async () => {
      (generateBotConnectorImage as jest.Mock).mockRejectedValue(
        new BotConnectorImageError('rate_limited', {
          statusCode: 429,
          retryAfterSeconds: 42,
        }),
      );

      const {getByTestId, getByText} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'again');
      fireEvent.press(getByTestId('generate-image-button'));

      await waitFor(() =>
        expect(getByText(t4(copy.errors.rateLimited, 42))).toBeTruthy(),
      );
    });

    it('never shows raw failure text for unexpected errors', async () => {
      (generateBotConnectorImage as jest.Mock).mockRejectedValue(
        new Error('quota exceeded'),
      );

      const {getByTestId, getByText, queryByText, UNSAFE_queryAllByType} =
        renderScreen();

      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'a red cube');
      fireEvent.press(getByTestId('generate-image-button'));

      await waitFor(() => expect(getByTestId('image-error')).toBeTruthy());
      expect(getByText(copy.errorGenerate)).toBeTruthy();
      expect(queryByText('quota exceeded')).toBeNull();

      // The generate action is usable again after the failure.
      const buttonsAfter = () =>
        UNSAFE_queryAllByType(require('react-native-paper').Button);
      expect(getGenerateButton(buttonsAfter())?.props.disabled).toBe(false);
    });
  });

  describe('history', () => {
    it('lists the generated image and regenerates from it', async () => {
      const {getByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'first prompt');
      fireEvent.press(getByTestId('generate-image-button'));
      await waitFor(() =>
        expect(getByTestId('image-history-list')).toBeTruthy(),
      );

      const thumb = getByTestId(/^history-thumb-/);
      fireEvent.press(thumb);

      await waitFor(() => expect(getByTestId('history-actions')).toBeTruthy());

      fireEvent.changeText(getByTestId('image-prompt-input'), 'typed later');
      fireEvent.press(
        getByTestId('history-actions').findByProps({
          accessibilityLabel: copy.history.regenerate,
        }),
      );

      expect(getByTestId('image-prompt-input').props.value).toBe(
        'first prompt',
      );
    });
    it('deletes a history entry and its file', async () => {
      const {getByTestId, queryByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'to delete');
      fireEvent.press(getByTestId('generate-image-button'));
      await waitFor(() =>
        expect(getByTestId('image-history-list')).toBeTruthy(),
      );

      fireEvent.press(getByTestId(/^history-thumb-/));
      await waitFor(() => expect(getByTestId('history-actions')).toBeTruthy());

      const deleteButton = getByTestId('history-actions').findByProps({
        accessibilityLabel: copy.history.delete,
      });
      // The delete handler is async (storage + unlink): keep its continuation
      // inside act so the resulting state update flushes deterministically.
      await act(async () => {
        fireEvent.press(deleteButton);
      });

      expect(queryByTestId('image-history-list')).toBeNull();
      // The image file itself is removed from disk.
      expect(RNFS.unlink).toHaveBeenCalled();
    });

    it('toggles favorite from the history actions', async () => {
      const {getByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'fav me');
      fireEvent.press(getByTestId('generate-image-button'));
      await waitFor(() =>
        expect(getByTestId('image-history-list')).toBeTruthy(),
      );

      fireEvent.press(getByTestId(/^history-thumb-/));
      const favoriteButton = () =>
        getByTestId('history-actions').findByProps({
          accessibilityLabel: copy.history.favorite,
        });

      await waitFor(() => expect(favoriteButton()).toBeTruthy());
      await act(async () => {
        fireEvent.press(favoriteButton());
      });

      expect(
        getByTestId('history-actions').findByProps({
          accessibilityLabel: copy.history.unfavorite,
        }),
      ).toBeTruthy();
    });
  });

  describe('save to gallery', () => {
    it('appends the chosen style words to what the server sees, not to the saved prompt', async () => {
      const {getByTestId} = renderScreen();
      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );

      fireEvent.changeText(getByTestId('image-prompt-input'), 'a red fox');
      fireEvent.press(getByTestId('image-style-anime'));
      fireEvent.press(getByTestId('generate-image-button'));

      await waitFor(() =>
        expect(generateBotConnectorImage).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: 'a red fox, anime style, clean line art, vibrant colors',
          }),
        ),
      );
      await waitFor(() => expect(getByTestId('generated-image')).toBeTruthy());
      // The history keeps the user's own words so "use again" is clean.
      fireEvent.press(getByTestId(/^history-thumb-/));
      fireEvent.press(getByTestId('image-style-none'));
      expect(getByTestId('image-prompt-input').props.value).toBe('a red fox');
    });

    it('pressing the selected style again clears it', async () => {
      const {getByTestId} = renderScreen();
      await waitFor(() => expect(getByTestId('image-style-logo')).toBeTruthy());
      fireEvent.press(getByTestId('image-style-logo'));
      expect(
        getByTestId('image-style-logo').props.accessibilityState.selected,
      ).toBe(true);
      fireEvent.press(getByTestId('image-style-logo'));
      expect(
        getByTestId('image-style-none').props.accessibilityState.selected,
      ).toBe(true);
    });

    it('offers "generate again" and "edit with this" under the result', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockReturnValue(undefined);
      const {getByTestId} = renderScreen();
      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'a blue cube');
      fireEvent.press(getByTestId('generate-image-button'));
      await waitFor(() => expect(getByTestId('generated-image')).toBeTruthy());

      // Imagen 4 (selected) cannot take reference photos: explain, don't fail silently.
      fireEvent.press(getByTestId('edit-with-result'));
      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith(
          'BotConnector',
          copy.editUnsupported,
        ),
      );

      fireEvent.press(getByTestId('generate-again'));
      await waitFor(() =>
        expect(generateBotConnectorImage).toHaveBeenCalledTimes(2),
      );
    });

    it('saves the generated image when the button is pressed', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockReturnValue(undefined);
      const {getByTestId} = renderScreen();

      await waitFor(() =>
        expect(getByTestId('generate-image-button')).toBeTruthy(),
      );
      fireEvent.changeText(getByTestId('image-prompt-input'), 'keep it');
      fireEvent.press(getByTestId('generate-image-button'));
      await waitFor(() => expect(getByTestId('generated-image')).toBeTruthy());

      fireEvent.press(getByTestId('save-generated-image'));

      await waitFor(() =>
        expect(CameraRoll.save).toHaveBeenCalledWith(
          expect.stringMatching(/^file:\/\//),
          {type: 'photo'},
        ),
      );
      expect(alert).toHaveBeenCalledWith('BotConnector', copy.save.done);
    });
  });
});

// Local parametrized strings (mirrors t() from src/locales).
function t4(template: string, value: number): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) =>
    key === 'count' || key === 'seconds' ? String(value) : `{{${key}}}`,
  );
}
