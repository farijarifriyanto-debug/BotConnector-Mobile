import React from 'react';
import {runInAction} from 'mobx';
import {Alert, StyleSheet} from 'react-native';

import {LlamaContext} from 'llama.rn';
import {
  render as baseRender,
  fireEvent,
  act,
  waitFor,
  within,
} from '../../../../jest/test-utils';
import {ChatScreen} from '../ChatScreen';

import {
  botConnectorAuthStore,
  chatSessionStore,
  modelStore,
  searchProviderStore,
  serverStore,
  uiStore,
} from '../../../store';

import {l10n} from '../../../locales';
import {mockLlamaContextParams} from '../../../../jest/fixtures/models';
import {bodyExtras} from '../../../api/servers';
import {ModelOrigin} from '../../../utils/types';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

// The pill renders the localized effort tier (e.g. 'Low'), not the raw carrier
// token ('low'); map the token through the same table the component uses.
const effortLabels = l10n.en.components.modelSettingsSheet.effortLevels;
const effortLabel = (token: keyof typeof effortLabels) => effortLabels[token];

describe('ChatScreen', () => {
  let llamaRN;

  beforeEach(() => {
    jest.clearAllMocks();
    llamaRN = require('llama.rn');
  });

  it('renders correctly when model is not loaded', () => {
    const {getByPlaceholderText} = render(<ChatScreen />, {
      withNavigation: true,
    });
    expect(getByPlaceholderText(l10n.en.chat.modelNotLoaded)).toBeTruthy();
  });

  it('renders correctly when model is loading', () => {
    modelStore.isContextLoading = true;
    const {getByPlaceholderText} = render(<ChatScreen />, {
      withNavigation: true,
    });
    expect(getByPlaceholderText(l10n.en.chat.loadingModel)).toBeTruthy();
  });

  it('renders correctly when model is loaded', () => {
    modelStore.context = new LlamaContext(mockLlamaContextParams);
    modelStore.engine = {
      completion: jest.fn((params, onData) =>
        modelStore.context!.completion(params, onData),
      ),
      stopCompletion: jest.fn(),
    };
    const {getByPlaceholderText} = render(<ChatScreen />, {
      withNavigation: true,
    });
    expect(getByPlaceholderText(l10n.en.chat.typeYourMessage)).toBeTruthy();
  });

  it('handles sending a message', async () => {
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
      modelStore.context = new LlamaContext(mockLlamaContextParams);
    });
    modelStore.context!.completion = jest.fn().mockResolvedValue({
      timings: {predicted_per_token_ms: 10, predicted_per_second: 100},
    });
    modelStore.engine = {
      completion: jest.fn((params, onData) =>
        modelStore.context!.completion(params, onData),
      ),
      stopCompletion: jest.fn(),
    };

    const {getByPlaceholderText, getByTestId} = render(<ChatScreen />, {
      withNavigation: true,
    });
    const input = getByPlaceholderText(l10n.en.chat.typeYourMessage);

    await act(async () => {
      fireEvent.changeText(input, 'Hello, PocketPal AI!');
    });

    const sendButton = getByTestId('send-button');
    fireEvent.press(sendButton);

    await waitFor(() => {
      expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
        expect.objectContaining({
          author: expect.objectContaining({id: 'y9d7f8pgn'}),
          text: 'Hello, PocketPal AI!',
        }),
      );
    });

    await waitFor(() => {
      expect(modelStore.context).toBeTruthy();
      if (modelStore.context) {
        expect(modelStore.context.completion).toHaveBeenCalled();
      }
    });
  });

  it('handles sending a message failure', async () => {
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
      modelStore.context = new LlamaContext(mockLlamaContextParams);
    });
    modelStore.context!.completion = jest
      .fn()
      .mockRejectedValue(new Error('Completion failed'));
    modelStore.engine = {
      completion: jest.fn((params, onData) =>
        modelStore.context!.completion(params, onData),
      ),
      stopCompletion: jest.fn(),
    };

    const {getByPlaceholderText, getByTestId} = render(<ChatScreen />, {
      withNavigation: true,
    });
    const input = getByPlaceholderText(l10n.en.chat.typeYourMessage);

    await act(async () => {
      fireEvent.changeText(input, 'Hello, PocketPal!');
    });

    const sendButton = getByTestId('send-button');
    await act(async () => {
      fireEvent.press(sendButton);
    });

    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        author: expect.objectContaining({id: 'h3o3lc5xj'}),
        text: 'Completion failed: Completion failed',
        metadata: expect.objectContaining({system: true}),
      }),
    );
  });

  it('renders different message types correctly', async () => {
    modelStore.context = new LlamaContext(mockLlamaContextParams);
    modelStore.engine = {
      completion: jest.fn((params, onData) =>
        modelStore.context!.completion(params, onData),
      ),
      stopCompletion: jest.fn(),
    };
    jest
      .spyOn(chatSessionStore, 'currentSessionMessages', 'get')
      .mockReturnValue([
        {
          id: 'unique-message-id-1',
          author: {id: 'y9d7f8pgn'},
          text: 'User message',
          type: 'text',
        },
        {
          id: 'unique-message-id-2',
          author: {id: 'h3o3lc5xj'},
          text: 'Assistant message',
          type: 'text',
        },
        {
          id: 'unique-message-id-3',
          author: {id: 'system'},
          text: 'System message',
          type: 'text',
        },
      ]);

    const {getByText} = render(<ChatScreen />, {
      withNavigation: true,
    });

    expect(getByText('User message')).toBeTruthy();
    expect(getByText('Assistant message')).toBeTruthy();
    expect(getByText('System message')).toBeTruthy();
  });

  it('stops ongoing completion when stop button is pressed', async () => {
    modelStore.context = new llamaRN.LlamaContext({
      contextId: 1,
      gpu: false,
      reasonNoGPU: '',
      model: {},
    });
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockReturnValue(new Promise(() => {})); // Never resolves
    }
    modelStore.engine = {
      completion: jest.fn((params, onData) =>
        modelStore.context!.completion(params, onData),
      ),
      stopCompletion: jest.fn(),
    };

    const {getByPlaceholderText, getByTestId} = render(<ChatScreen />, {
      withNavigation: true,
    });
    const input = getByPlaceholderText(l10n.en.chat.typeYourMessage);

    await act(async () => {
      fireEvent.changeText(input, 'Hello, AI!');
    });

    await act(async () => {
      const sendButton = getByTestId('send-button');
      fireEvent.press(sendButton);
      modelStore.setInferencing(true); // since mock doesn't really set inferencing
    });

    await waitFor(
      () => {
        expect(getByTestId('stop-button')).toBeTruthy();
      },
      {
        timeout: 1000,
      },
    );

    const stopButton = getByTestId('stop-button');
    await act(async () => {
      fireEvent.press(stopButton);
    });

    expect(modelStore.engine?.stopCompletion).toHaveBeenCalled();
  });

  describe('thinking toggle in no-session chat', () => {
    const palStore = require('../../../store').palStore;
    const thinkingPal = {
      id: 'pal-thinking',
      type: 'assistant' as const,
      name: 'Thinker',
      systemPrompt: '',
      parameters: {},
      parameterSchema: [],
      isSystemPromptChanged: false,
      useAIPrompt: false,
      source: 'local' as const,
      completionSettings: {enable_thinking: true},
    };

    let savedModels: any[];

    beforeEach(() => {
      // Inject a reasoning-capable model so the resolver in ChatScreen reports
      // isReasoning 'yes' and the thinking pill is shown.
      savedModels = modelStore.models;
      const thinkingModel = {
        ...modelStore.models[0],
        id: 'thinking-model-id',
        supportsThinking: true,
        reasoning: {
          isReasoning: 'yes' as const,
          source: 'detected' as const,
          supportsEffort: false,
          effortValues: [],
          effortSource: 'none' as const,
        },
      };
      modelStore.models = [...modelStore.models, thinkingModel];

      runInAction(() => {
        modelStore.activeModelId = 'thinking-model-id';
        modelStore.context = new LlamaContext(mockLlamaContextParams);
        chatSessionStore.activeSessionId = null;
        chatSessionStore.newChatPalId = thinkingPal.id;
        chatSessionStore.newChatThinkingOverride = undefined;
      });
      modelStore.engine = {
        completion: jest.fn(),
        stopCompletion: jest.fn(),
      };
      palStore.pals = [thinkingPal];
    });

    afterEach(() => {
      modelStore.models = savedModels;
      modelStore.activeModelId = undefined;
      jest.restoreAllMocks();
    });

    it('toggle press writes newChatThinkingOverride and does NOT touch newChatCompletionSettings', async () => {
      const setGlobalSpy = jest.spyOn(
        chatSessionStore,
        'setNewChatCompletionSettings',
      );

      const {getByLabelText} = render(<ChatScreen />, {
        withNavigation: true,
      });

      // Initial state: thinkingEnabled defaults true → toggle label is
      // "Disable thinking mode". Tapping it should write `false` into the
      // override field.
      const toggle = getByLabelText('Disable thinking mode');
      await act(async () => {
        fireEvent.press(toggle);
      });

      // Primary signal: override is set to the new value.
      expect(chatSessionStore.newChatThinkingOverride).toBe(false);

      // Negative guard: global no-chat settings were NOT mutated.
      expect(setGlobalSpy).not.toHaveBeenCalled();
    });
  });

  describe('tool-compatibility banner', () => {
    const palStore = require('../../../store').palStore;
    const uiStore = require('../../../store').uiStore;

    const palWithTalents = {
      id: 'pal-with-talents',
      type: 'assistant' as const,
      name: 'Tool Pal',
      systemPrompt: '',
      parameters: {},
      parameterSchema: [],
      isSystemPromptChanged: false,
      useAIPrompt: false,
      source: 'local' as const,
      pact: {talents: [{name: 'calculate'}]},
    };

    const buildContextWithCaps = (caps: {
      defaultTools?: boolean;
      defaultToolCalls?: boolean;
      toolUse?: boolean;
      toolUseCaps?: boolean;
    }) => {
      const ctx = new LlamaContext(mockLlamaContextParams);
      (ctx as any).model = {
        ...mockLlamaContextParams.model,
        chatTemplates: {
          llamaChat: false,
          jinja: {
            default: true,
            defaultCaps: {
              tools: !!caps.defaultTools,
              toolCalls: !!caps.defaultToolCalls,
              systemRole: false,
              parallelToolCalls: false,
            },
            toolUse: !!caps.toolUse,
            toolUseCaps: caps.toolUseCaps
              ? {
                  tools: true,
                  toolCalls: true,
                  systemRole: false,
                  parallelToolCalls: false,
                }
              : undefined,
          },
        },
      };
      return ctx;
    };

    const renderWithToolPal = (ctx: LlamaContext) => {
      runInAction(() => {
        modelStore.activeModelId = 'tool-model-id';
        modelStore.context = ctx;
      });
      palStore.pals = [palWithTalents];
      jest
        .spyOn(require('../../../store').chatSessionStore, 'activePalId', 'get')
        .mockReturnValue(palWithTalents.id);
      return render(<ChatScreen />, {withNavigation: true});
    };

    beforeEach(() => {
      uiStore.setChatWarning.mockClear();
      uiStore.hasWarnedToolCompat.mockReturnValue(false);
    });

    it('does NOT warn when defaultCaps.tools is true (Ministral-style)', () => {
      renderWithToolPal(buildContextWithCaps({defaultTools: true}));
      expect(uiStore.setChatWarning).not.toHaveBeenCalled();
    });

    it('does NOT warn when defaultCaps.toolCalls is true', () => {
      renderWithToolPal(buildContextWithCaps({defaultToolCalls: true}));
      expect(uiStore.setChatWarning).not.toHaveBeenCalled();
    });

    it('does NOT warn when toolUse is true (Qwen3-style)', () => {
      renderWithToolPal(buildContextWithCaps({toolUse: true}));
      expect(uiStore.setChatWarning).not.toHaveBeenCalled();
    });

    it('does NOT warn when toolUseCaps object is present', () => {
      renderWithToolPal(buildContextWithCaps({toolUseCaps: true}));
      expect(uiStore.setChatWarning).not.toHaveBeenCalled();
    });

    it('warns once when all four capability slots are absent', () => {
      renderWithToolPal(buildContextWithCaps({}));
      expect(uiStore.setChatWarning).toHaveBeenCalledTimes(1);
      expect(uiStore.markToolCompatWarned).toHaveBeenCalledWith(
        'tool-model-id',
      );
    });
  });
});

describe('ChatScreen reasoning pill visibility', () => {
  let savedModels: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    savedModels = modelStore.models;
    runInAction(() => {
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      serverStore.remoteReasoning = {};
    });
    modelStore.engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    } as any;
  });

  afterEach(() => {
    modelStore.models = savedModels;
    modelStore.activeModelId = undefined;
  });

  const useModel = (overrides: any) => {
    const model = {...savedModels[0], id: 'pill-model', ...overrides};
    modelStore.models = [...savedModels, model];
    runInAction(() => {
      modelStore.activeModelId = 'pill-model';
    });
  };

  it("shows the pill when isReasoning is 'unknown' (fail-open)", () => {
    useModel({supportsThinking: undefined, reasoning: undefined});
    const {queryByTestId} = render(<ChatScreen />, {withNavigation: true});
    expect(queryByTestId('thinking-toggle')).toBeTruthy();
  });

  it("hides the pill when isReasoning is 'no'", () => {
    useModel({
      reasoning: {
        isReasoning: 'no',
        source: 'user',
        supportsEffort: true,
        effortValues: ['low', 'high'],
        effortSource: 'user',
      },
    });
    const {queryByTestId} = render(<ChatScreen />, {withNavigation: true});
    expect(queryByTestId('thinking-toggle')).toBeNull();
  });

  it('shows the pill for a graded effort model', () => {
    useModel({
      reasoning: {
        isReasoning: 'yes',
        source: 'user',
        supportsEffort: true,
        effortValues: ['low', 'medium', 'high'],
        effortSource: 'user',
      },
    });
    const {queryByTestId} = render(<ChatScreen />, {withNavigation: true});
    expect(queryByTestId('thinking-toggle')).toBeTruthy();
  });
});

describe('ChatScreen reasoning override reaches the pill (live, no remount)', () => {
  // Reproduces the user-reported flow: a model is loaded as the active chat
  // model with NO reasoning capability (binary pill), the chat is already on
  // screen, then the user saves a graded-effort override on the model card.
  // The card mutates the live observable Model via setReasoningOverride; the
  // already-mounted ChatScreen must react and the pill must become graded
  // without a remount. Existing tests bake `reasoning` in before render, so
  // they cannot catch a broken live-override/observation path.
  let savedModels: any[];
  let savedSessionId: string | null | undefined;
  // Persisted reasoning settings for the active session — the pill init effect
  // reads enable_thinking back from here, mirroring real session persistence.
  let persisted: {enable_thinking: boolean; reasoning?: {effort?: string}};

  beforeEach(() => {
    jest.clearAllMocks();
    savedModels = modelStore.models;
    savedSessionId = chatSessionStore.activeSessionId;
    // Start from a settled OFF pill so the first graded tap advances to the
    // first effort value rather than wrapping the cycle from an on-state.
    persisted = {enable_thinking: false, reasoning: {effort: undefined}};
    runInAction(() => {
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      serverStore.remoteReasoning = {};
      chatSessionStore.activeSessionId = 'session-1';
    });
    modelStore.engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    } as any;
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockImplementation(async () => ({...persisted}));
    (
      chatSessionStore.updateSessionCompletionSettings as jest.Mock
    ).mockImplementation(async (s: any) => {
      persisted = {enable_thinking: s.enable_thinking, reasoning: s.reasoning};
      runInAction(() => {
        const session = chatSessionStore.sessions.find(
          x => x.id === 'session-1',
        );
        if (session) {
          (session as any).completionSettings = {...persisted};
        }
      });
    });
  });

  afterEach(() => {
    runInAction(() => {
      modelStore.models = savedModels;
      modelStore.activeModelId = undefined;
      chatSessionStore.activeSessionId = savedSessionId as any;
    });
  });

  it('turns the binary pill into a graded cycle after setReasoningOverride', async () => {
    const thinkText = l10n.en.components.chatInput.thinkingToggle.thinkText;

    // Active local model with reasoning absent → pill is binary on/off.
    const model = {
      ...savedModels[0],
      id: 'override-model',
      origin: ModelOrigin.LOCAL,
      supportsThinking: true,
      reasoning: undefined,
    };
    runInAction(() => {
      modelStore.models = [...savedModels, model];
      modelStore.activeModelId = 'override-model';
    });

    const {getByTestId} = render(<ChatScreen />, {
      withNavigation: true,
    });
    const pill = () => within(getByTestId('thinking-toggle'));

    // The pill starts binary and settled OFF (no effort label, no graded cycle
    // available yet).
    await waitFor(() => expect(pill().getByText(thinkText)).toBeTruthy());

    // User saves a graded-effort override on the model card. This is the exact
    // writer the ModelSettingsSheet calls.
    await act(async () => {
      modelStore.setReasoningOverride('override-model', {
        isReasoning: 'yes',
        source: 'user',
        supportsEffort: true,
        effortValues: ['low', 'medium', 'high'],
        effortSource: 'user',
      });
    });

    // The already-mounted ChatScreen must now drive a graded pill: tapping
    // cycles off → low → medium → high instead of a plain on/off toggle. Each
    // tap awaits the async persist + state flush before the label settles.
    for (const expected of ['low', 'medium', 'high'] as const) {
      await act(async () => {
        fireEvent.press(getByTestId('thinking-toggle'));
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
      });
      await waitFor(() =>
        expect(pill().getByText(effortLabel(expected))).toBeTruthy(),
      );
    }
  });

  it('graded cycle advances in a fresh chat (no active session)', async () => {
    // The user-reported repro: a freshly loaded model in a brand-new chat (no
    // session yet). The graded pill must still advance off → low → medium →
    // high. The no-session path stages the effort on the new-chat override
    // fields; if it drops the effort grade the cycle collapses to on/off and
    // the pill alternates instead of stepping through the grades.
    runInAction(() => {
      chatSessionStore.activeSessionId = null as any;
      chatSessionStore.newChatThinkingOverride = undefined;
      chatSessionStore.newChatReasoningEffort = undefined;
    });
    // Mirror resolveCompletionSettings' no-session overlay: read the on/off and
    // effort back from the new-chat override fields the pill writes through.
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockImplementation(async () => ({
      enable_thinking: chatSessionStore.newChatThinkingOverride ?? false,
      reasoning: {
        enabled: chatSessionStore.newChatThinkingOverride ?? false,
        effort: chatSessionStore.newChatReasoningEffort,
      },
    }));

    const model = {
      ...savedModels[0],
      id: 'fresh-chat-model',
      origin: ModelOrigin.HF,
      supportsThinking: true,
      reasoning: {
        isReasoning: 'yes' as const,
        source: 'user' as const,
        supportsEffort: true,
        effortValues: ['low', 'medium', 'high'],
        effortSource: 'user' as const,
      },
    };
    runInAction(() => {
      modelStore.models = [...savedModels, model];
      modelStore.activeModelId = 'fresh-chat-model';
    });

    const {getByTestId} = render(<ChatScreen />, {withNavigation: true});
    const pill = () => within(getByTestId('thinking-toggle'));
    const thinkText = l10n.en.components.chatInput.thinkingToggle.thinkText;

    await waitFor(() => expect(pill().getByText(thinkText)).toBeTruthy());

    for (const expected of ['low', 'medium', 'high'] as const) {
      await act(async () => {
        fireEvent.press(getByTestId('thinking-toggle'));
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
      });
      await waitFor(() =>
        expect(pill().getByText(effortLabel(expected))).toBeTruthy(),
      );
    }
  });
});

describe('ChatScreen graded effort pill cycle', () => {
  let savedModels: any[];
  let savedSessionId: string | null | undefined;
  // Persisted reasoning settings for the active session. The pill's cycle
  // writes through updateSessionCompletionSettings; the init effect reads back
  // via getCurrentCompletionSettings, mirroring real session persistence so a
  // re-render does not clobber the just-applied state.
  let persisted: {enable_thinking: boolean; reasoning?: {effort?: string}};

  beforeEach(() => {
    jest.clearAllMocks();
    savedModels = modelStore.models;
    savedSessionId = chatSessionStore.activeSessionId;
    persisted = {enable_thinking: false, reasoning: {effort: undefined}};
    runInAction(() => {
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      serverStore.remoteReasoning = {};
      chatSessionStore.activeSessionId = 'session-1';
    });
    modelStore.engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    } as any;
    // Pill initializes to OFF; cycle round-trips through the session settings.
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockImplementation(async () => ({...persisted}));
    (
      chatSessionStore.updateSessionCompletionSettings as jest.Mock
    ).mockImplementation(async (s: any) => {
      persisted = {
        enable_thinking: s.enable_thinking,
        reasoning: s.reasoning,
      };
      // Bump the session reference so the init effect re-reads the new value.
      runInAction(() => {
        const session = chatSessionStore.sessions.find(
          x => x.id === 'session-1',
        );
        if (session) {
          (session as any).completionSettings = {...persisted};
        }
      });
    });
  });

  afterEach(() => {
    modelStore.models = savedModels;
    runInAction(() => {
      modelStore.activeModelId = undefined;
      chatSessionStore.activeSessionId = savedSessionId as any;
    });
  });

  const useGradedModel = () => {
    const model = {
      ...savedModels[0],
      id: 'graded-model',
      reasoning: {
        isReasoning: 'yes' as const,
        source: 'user' as const,
        supportsEffort: true,
        effortValues: ['low', 'medium', 'high'],
        effortSource: 'user' as const,
      },
    };
    modelStore.models = [...savedModels, model];
    runInAction(() => {
      modelStore.activeModelId = 'graded-model';
    });
  };

  // A graded model's single pill cycles off → low → medium → high → off in
  // value-set order, never on/off only.
  it('cycles off → low → medium → high → off in value-set order', async () => {
    const thinkText = l10n.en.components.chatInput.thinkingToggle.thinkText;
    useGradedModel();
    const {getByTestId} = render(<ChatScreen />, {withNavigation: true});
    const pill = () => within(getByTestId('thinking-toggle'));

    // The init effect resolves enable_thinking:false → pill settles to OFF.
    await waitFor(() => expect(pill().getByText(thinkText)).toBeTruthy());

    for (const expected of ['low', 'medium', 'high'] as const) {
      await act(async () => {
        fireEvent.press(getByTestId('thinking-toggle'));
      });
      await waitFor(() =>
        expect(pill().getByText(effortLabel(expected))).toBeTruthy(),
      );
      // The chosen effort is persisted onto the reasoning carrier intent.
      expect(persisted).toMatchObject({
        enable_thinking: true,
        reasoning: {enabled: true, effort: expected},
      });
    }

    // One more tap past the last value wraps back to off.
    await act(async () => {
      fireEvent.press(getByTestId('thinking-toggle'));
    });
    await waitFor(() => expect(pill().getByText(thinkText)).toBeTruthy());
    expect(persisted).toMatchObject({
      enable_thinking: false,
      reasoning: {enabled: false, effort: undefined},
    });
  });
});

describe('ChatScreen on/off toggle → reasoning carrier (remote)', () => {
  let savedModels: any[];
  let savedSessionId: string | null | undefined;
  // Session-backed persistence so the simple on/off toggle round-trips through
  // updateSessionCompletionSettings, mirroring real session behaviour.
  let persisted: {
    enable_thinking: boolean;
    reasoning?: {enabled: boolean; effort?: string};
  };

  beforeEach(() => {
    jest.clearAllMocks();
    savedModels = modelStore.models;
    savedSessionId = chatSessionStore.activeSessionId;
    persisted = {enable_thinking: true, reasoning: undefined};
    runInAction(() => {
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      // No entry → resolver reports isReasoning 'unknown' (pill shown,
      // fail-open) and supportsEffort false (simple on/off toggle).
      serverStore.remoteReasoning = {};
      chatSessionStore.activeSessionId = 'session-1';
    });
    modelStore.engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    } as any;
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockImplementation(async () => ({...persisted}));
    (
      chatSessionStore.updateSessionCompletionSettings as jest.Mock
    ).mockImplementation(async (s: any) => {
      persisted = {
        enable_thinking: s.enable_thinking,
        reasoning: s.reasoning,
      };
      runInAction(() => {
        const session = chatSessionStore.sessions.find(
          x => x.id === 'session-1',
        );
        if (session) {
          (session as any).completionSettings = {...persisted};
        }
      });
    });
  });

  afterEach(() => {
    modelStore.models = savedModels;
    runInAction(() => {
      modelStore.activeModelId = undefined;
      chatSessionStore.activeSessionId = savedSessionId as any;
    });
  });

  const useRemoteEffortUnknownModel = () => {
    const model = {
      ...savedModels[0],
      id: 'remote-effort-unknown',
      origin: ModelOrigin.REMOTE,
      supportsThinking: undefined,
      reasoning: undefined,
    };
    modelStore.models = [...savedModels, model];
    runInAction(() => {
      modelStore.activeModelId = 'remote-effort-unknown';
    });
  };

  // Toggling thinking OFF on a remote effort-unknown model must populate the
  // reasoning carrier (enabled:false), so the server profile produces the
  // per-type OFF wire shape.
  it('off toggle yields reasoning.enabled false reaching the server profile', async () => {
    useRemoteEffortUnknownModel();
    const {getByLabelText} = render(<ChatScreen />, {withNavigation: true});

    // Default thinkingEnabled true → label is "Disable thinking mode".
    const toggle = getByLabelText('Disable thinking mode');
    await act(async () => {
      fireEvent.press(toggle);
    });

    await waitFor(() =>
      expect(persisted.reasoning).toEqual({enabled: false, effort: undefined}),
    );
    expect(persisted.reasoning?.enabled).toBe(false);

    // The carrier drives the per-serverType OFF payload.
    expect(
      bodyExtras('llama.cpp', {
        samplers: {},
        reasoning: persisted.reasoning,
      }),
    ).toEqual({
      reasoning_format: 'auto',
      chat_template_kwargs: {enable_thinking: false},
    });
    expect(
      bodyExtras('Ollama', {
        samplers: {},
        reasoning: persisted.reasoning,
      }),
    ).toEqual({
      reasoning_effort: 'none',
    });
  });
});

// The image-attach affordance must reflect a capability that lands after the
// screen is already on screen: the probe is detached and a lazily-started
// server can take seconds to answer.
describe('ChatScreen remote vision reactivity', () => {
  // Build 14: the + control is always enabled (File works without vision).
  // Vision availability shows on the Gallery row instead (dimmed when unusable).
  const openGallery = async (screen: ReturnType<typeof render>) => {
    const plus = screen.getByLabelText('Add attachment');
    expect(plus.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(plus);
    return screen.findByText(l10n.en.common.gallery);
  };
  const isDimmed = (node: {props: {style?: unknown}}) =>
    StyleSheet.flatten(node.props.style as any)?.opacity === 0.45;

  const modelId = 'srv-1/gemma-4-e2b';
  let savedModels: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    savedModels = modelStore.models;
    modelStore.models = [
      ...savedModels,
      {
        ...savedModels[0],
        id: modelId,
        origin: ModelOrigin.REMOTE,
        serverId: 'srv-1',
        remoteModelId: 'gemma-4-e2b',
      },
    ];
    runInAction(() => {
      modelStore.context = undefined;
      modelStore.activeModelId = modelId;
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'llama',
          url: 'http://localhost:8080',
          serverType: 'llama.cpp',
        } as any,
      ];
      serverStore.remoteCaps = {};
    });
    modelStore.engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    } as any;
  });

  afterEach(() => {
    modelStore.models = savedModels;
    runInAction(() => {
      modelStore.activeModelId = undefined;
      serverStore.servers = [];
      serverStore.remoteCaps = {};
    });
  });

  it('enables attach when capabilities land, with no further user action', async () => {
    const screen = render(<ChatScreen />, {withNavigation: true});

    expect(isDimmed(await openGallery(screen))).toBe(true);

    act(() => {
      runInAction(() => {
        serverStore.remoteCaps[modelId] = {supportsVision: true};
      });
    });

    expect(isDimmed(await screen.findByText(l10n.en.common.gallery))).toBe(
      false,
    );
  });

  it('enables attach when a local model finishes loading its projection', async () => {
    const localId = 'local-mm-1';
    runInAction(() => {
      modelStore.models = [
        ...savedModels,
        {
          ...savedModels[0],
          id: localId,
          origin: ModelOrigin.PRESET,
          supportsMultimodal: true,
        },
      ];
      modelStore.activeModelId = localId;
      modelStore.isMultimodalActive = false;
    });

    const screen = render(<ChatScreen />, {withNavigation: true});

    expect(isDimmed(await openGallery(screen))).toBe(true);

    // What `proceedWithInitialization` writes once the native init verifies.
    act(() => {
      runInAction(() => {
        modelStore.isMultimodalActive = true;
      });
    });

    expect(isDimmed(await screen.findByText(l10n.en.common.gallery))).toBe(
      false,
    );

    runInAction(() => {
      modelStore.isMultimodalActive = false;
    });
  });

  it('does not let the active model inherit a sibling model vision flag', async () => {
    act(() => {
      runInAction(() => {
        serverStore.remoteCaps['srv-1/gemma-3-4b'] = {supportsVision: true};
      });
    });

    const screen = render(<ChatScreen />, {withNavigation: true});

    expect(isDimmed(await openGallery(screen))).toBe(true);
  });
});

describe('ChatScreen internet helper & capability healing', () => {
  const bcServer = {
    id: 'bc-net',
    name: 'BotConnector',
    url: 'https://api.botconnector.id',
    serverType: 'OpenAI',
  } as any;
  const modelId = 'bc-net/text-model';
  let savedModels: any[];
  let alertSpy: jest.SpyInstance;
  let startLoginSpy: jest.SpyInstance;
  let openPickerSpy: jest.SpyInstance;
  let accessRefreshSpy: jest.SpyInstance;
  let catalogRefreshSpy: jest.SpyInstance;

  const signedInEntry = (capabilities: Record<string, boolean>) =>
    ({
      object: 'botconnector.client_capabilities',
      plan: 'plus',
      access: 'full',
      paid: true,
      entitlement_sources: {
        subscription: true,
        payg: false,
        family: false,
      },
      capabilities: {
        chat: true,
        web_search: true,
        read_url: true,
        tools: true,
        vision: true,
        media: true,
        files: true,
        ...capabilities,
      },
    }) as any;

  const activateCloudModel = (access: any) =>
    runInAction(() => {
      serverStore.servers = [bcServer];
      serverStore.remoteCaps = {};
      serverStore.botConnectorAccess =
        access === undefined ? {} : {'bc-net': access};
      modelStore.models = [
        ...savedModels,
        {
          id: modelId,
          origin: ModelOrigin.REMOTE,
          serverId: 'bc-net',
          remoteModelId: 'text-model',
        },
      ];
      modelStore.activeModelId = modelId;
      modelStore.context = undefined;
      modelStore.engine = {
        completion: jest.fn(),
        stopCompletion: jest.fn(),
      } as any;
    });

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    startLoginSpy = jest
      .spyOn(botConnectorAuthStore, 'startLogin')
      .mockResolvedValue(undefined);
    openPickerSpy = jest
      .spyOn(uiStore, 'openModelPicker')
      .mockImplementation(() => undefined);
    accessRefreshSpy = jest
      .spyOn(serverStore, 'refreshBotConnectorAccess')
      .mockResolvedValue(undefined);
    catalogRefreshSpy = jest
      .spyOn(serverStore, 'refreshBotConnectorCatalog')
      .mockResolvedValue(undefined);
    savedModels = modelStore.models;
    (botConnectorAuthStore as any).account = null;
    (botConnectorAuthStore as any).hasStoredSession = false;
    (botConnectorAuthStore as any).isSignedIn = false;
    runInAction(() => {
      serverStore.botConnectorCatalog = {};
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    startLoginSpy.mockRestore();
    openPickerSpy.mockRestore();
    accessRefreshSpy.mockRestore();
    catalogRefreshSpy.mockRestore();
    modelStore.models = savedModels;
    runInAction(() => {
      modelStore.activeModelId = undefined;
      modelStore.context = undefined;
      serverStore.servers = [];
      serverStore.serverModels.clear();
      serverStore.remoteCaps = {};
      serverStore.botConnectorAccess = {};
      serverStore.botConnectorAccessState = {};
      serverStore.botConnectorCatalog = {};
      searchProviderStore.setConsent(false);
      searchProviderStore.setForceInternetSearch(false);
      uiStore.modelPickerVisible = false;
    });
    (botConnectorAuthStore as any).account = null;
    (botConnectorAuthStore as any).hasStoredSession = false;
    (botConnectorAuthStore as any).isSignedIn = false;
  });

  it('explains Internet sign-in instead of a dead end, then starts native login', async () => {
    activateCloudModel(undefined);

    const screen = render(<ChatScreen />, {withNavigation: true});
    const globe = await screen.findByTestId('internet-toggle');
    fireEvent.press(globe);

    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    expect(call[0]).toBe(l10n.en.components.chatInput.internetSignIn.title);
    expect(call[1]).toBe(l10n.en.components.chatInput.internetSignIn.body);
    const signInButton = call[2].find(
      (button: any) => button.text === l10n.en.settings.connectBotConnector,
    );
    expect(signInButton).toBeTruthy();
    signInButton.onPress();
    expect(startLoginSpy).toHaveBeenCalledTimes(1);
    expect(accessRefreshSpy).not.toHaveBeenCalled();
  });

  it('routes an unavailable Internet toggle to model selection when signed in', async () => {
    runInAction(() => {
      (botConnectorAuthStore as any).hasStoredSession = true;
      (botConnectorAuthStore as any).isSignedIn = true;
    });
    activateCloudModel(signedInEntry({web_search: false}));

    const screen = render(<ChatScreen />, {withNavigation: true});
    const globe = await screen.findByTestId('internet-toggle');
    fireEvent.press(globe);

    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    expect(call[0]).toBe(
      l10n.en.components.chatInput.internetUnavailable.title,
    );
    expect(call[1]).toBe(l10n.en.components.chatInput.internetUnavailable.body);
    const chooseModelButton = call[2].find(
      (button: any) => button.text === l10n.en.camera.chooseVisionModel,
    );
    expect(chooseModelButton).toBeTruthy();
    chooseModelButton.onPress();
    expect(openPickerSpy).toHaveBeenCalledWith('models');
  });

  it('explains a failed capability check instead of blaming the plan when signed in', async () => {
    runInAction(() => {
      (botConnectorAuthStore as any).hasStoredSession = true;
      (botConnectorAuthStore as any).isSignedIn = true;
    });
    // No cached capabilities + refresh resolves with nothing: the check
    // itself failed, so the copy must say the status could not be checked.
    activateCloudModel(undefined);

    const screen = render(<ChatScreen />, {withNavigation: true});
    const globe = await screen.findByTestId('internet-toggle');
    fireEvent.press(globe);

    await waitFor(() => {
      expect(accessRefreshSpy).toHaveBeenCalled();
      const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
      expect(call[0]).toBe(l10n.en.components.capability.unavailableTitle);
      expect(call[1]).toBe(l10n.en.components.capability.unavailableBody);
      const retryButton = call[2].find(
        (button: any) => button.text === l10n.en.components.capability.retry,
      );
      expect(retryButton).toBeTruthy();
    });
  });

  it('keeps the attachment entry when the files axis is on, ignoring the legacy access flag', async () => {
    runInAction(() => {
      (botConnectorAuthStore as any).hasStoredSession = true;
      (botConnectorAuthStore as any).isSignedIn = true;
    });
    // Contract: filesEnabled reads capabilities.files only — a stale
    // access:'chat_only' must not hide attachments when files=true.
    activateCloudModel({
      object: 'botconnector.client_capabilities',
      plan: 'plus',
      access: 'chat_only',
      paid: false,
      entitlement_sources: {subscription: true, payg: false, family: false},
      capabilities: {
        chat: true,
        web_search: false,
        read_url: false,
        tools: true,
        vision: false,
        media: true,
        files: true,
      },
    } as any);

    const screen = render(<ChatScreen />, {withNavigation: true});

    expect(screen.getByLabelText('Add attachment')).toBeTruthy();
  });

  it('explains a 429 capability refusal as a rate limit, not a backend outage', async () => {
    runInAction(() => {
      (botConnectorAuthStore as any).hasStoredSession = true;
      (botConnectorAuthStore as any).isSignedIn = true;
    });
    activateCloudModel(signedInEntry({web_search: false}));
    // The last capability check failed with 429 — state carries the kind.
    runInAction(() => {
      serverStore.botConnectorAccessState = {
        'bc-net': {
          loading: false,
          error: true,
          errorKind: 'quota_rate_limited',
        },
      };
    });

    const screen = render(<ChatScreen />, {withNavigation: true});
    const globe = await screen.findByTestId('internet-toggle');
    fireEvent.press(globe);

    await waitFor(() => {
      const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
      expect(call[0]).toBe(l10n.en.components.capability.quotaRateTitle);
      expect(call[1]).toBe(l10n.en.components.capability.quotaRateBody);
      const retryButton = call[2].find(
        (button: any) => button.text === l10n.en.components.capability.retry,
      );
      expect(retryButton).toBeTruthy();
    });
  });

  it('toggles explicit Internet mode when the account has Web Search', async () => {
    runInAction(() => {
      (botConnectorAuthStore as any).hasStoredSession = true;
      (botConnectorAuthStore as any).isSignedIn = true;
    });
    activateCloudModel(signedInEntry({web_search: true}));
    searchProviderStore.setConsent(true);

    const screen = render(<ChatScreen />, {withNavigation: true});
    const globe = await screen.findByTestId('internet-toggle');

    fireEvent.press(globe);
    expect(searchProviderStore.forceInternetSearch).toBe(true);

    fireEvent.press(globe);
    expect(searchProviderStore.forceInternetSearch).toBe(false);
  });

  it('revalidates a missing capability entry from the chat screen', async () => {
    runInAction(() => {
      (botConnectorAuthStore as any).hasStoredSession = true;
      (botConnectorAuthStore as any).isSignedIn = true;
    });
    activateCloudModel(undefined);

    render(<ChatScreen />, {withNavigation: true});

    await waitFor(() => {
      expect(accessRefreshSpy).toHaveBeenCalledTimes(1);
      expect(catalogRefreshSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('stays idle while signed out', async () => {
    activateCloudModel(undefined);

    render(<ChatScreen />, {withNavigation: true});

    expect(accessRefreshSpy).not.toHaveBeenCalled();
    expect(catalogRefreshSpy).not.toHaveBeenCalled();
  });
});

describe('ChatScreen vision from the live Cloud catalog', () => {
  const bcServer = {
    id: 'bc-vision',
    name: 'BotConnector',
    url: 'https://api.botconnector.id',
    serverType: 'OpenAI',
  } as any;
  const catalogFixture = {
    'mimo-v2.5': {
      id: 'mimo-v2.5',
      name: 'MiMo V2.5',
      capabilities: [
        'Tools',
        'Vision',
        'Video',
        'Reasoning',
        'Structured Output',
      ],
    },
    'gemini-2.5-flash-lite': {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash Lite',
      capabilities: [
        'Tools',
        'Vision',
        'Reasoning',
        'Structured Output',
        'Coding',
      ],
    },
    'ling-3.0-flash': {
      id: 'ling-3.0-flash',
      name: 'Ling 3.0 Flash',
      capabilities: ['Tools', 'Reasoning'],
    },
  };
  let savedModels: any[];
  let accessRefreshSpy: jest.SpyInstance;
  let catalogRefreshSpy: jest.SpyInstance;

  const openGallery = async (screen: ReturnType<typeof render>) => {
    const plus = screen.getByLabelText('Add attachment');
    expect(plus.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(plus);
    return screen.findByText(l10n.en.common.gallery);
  };
  const isDimmed = (node: {props: {style?: unknown}}) =>
    StyleSheet.flatten(node.props.style as any)?.opacity === 0.45;

  const activateCloudModel = (remoteModelId: string) =>
    runInAction(() => {
      serverStore.servers = [bcServer];
      serverStore.remoteCaps = {};
      serverStore.botConnectorCatalog = catalogFixture;
      serverStore.serverModels.set('bc-vision', [
        {id: 'mimo-v2.5', object: 'model', owned_by: ''},
        {id: 'gemini-2.5-flash-lite', object: 'model', owned_by: ''},
        {id: 'ling-3.0-flash', object: 'model', owned_by: ''},
      ]);
      serverStore.botConnectorAccess = {
        'bc-vision': {
          object: 'botconnector.client_capabilities',
          plan: 'plus',
          access: 'full',
          paid: true,
          entitlement_sources: {
            subscription: true,
            payg: false,
            family: false,
          },
          capabilities: {
            chat: true,
            web_search: true,
            read_url: true,
            tools: true,
            vision: true,
            media: true,
            files: true,
          },
        } as any,
      };
      modelStore.models = [
        ...savedModels,
        {
          id: `bc-vision/${remoteModelId}`,
          origin: ModelOrigin.REMOTE,
          serverId: 'bc-vision',
          remoteModelId,
        },
      ];
      modelStore.activeModelId = `bc-vision/${remoteModelId}`;
      modelStore.context = undefined;
      modelStore.engine = {
        completion: jest.fn(),
        stopCompletion: jest.fn(),
      } as any;
    });

  beforeEach(() => {
    jest.clearAllMocks();
    savedModels = modelStore.models;
    accessRefreshSpy = jest
      .spyOn(serverStore, 'refreshBotConnectorAccess')
      .mockResolvedValue(undefined);
    catalogRefreshSpy = jest
      .spyOn(serverStore, 'refreshBotConnectorCatalog')
      .mockResolvedValue(undefined);
    (botConnectorAuthStore as any).account = null;
    (botConnectorAuthStore as any).hasStoredSession = true;
  });

  afterEach(() => {
    accessRefreshSpy.mockRestore();
    catalogRefreshSpy.mockRestore();
    modelStore.models = savedModels;
    runInAction(() => {
      modelStore.activeModelId = undefined;
      modelStore.context = undefined;
      serverStore.servers = [];
      serverStore.serverModels.clear();
      serverStore.remoteCaps = {};
      serverStore.botConnectorAccess = {};
      serverStore.botConnectorAccessState = {};
      serverStore.botConnectorCatalog = {};
    });
    (botConnectorAuthStore as any).hasStoredSession = false;
  });

  it('keeps Gallery enabled for MiMo V2.5 (real catalog Vision)', async () => {
    activateCloudModel('mimo-v2.5');

    const screen = render(<ChatScreen />, {withNavigation: true});

    expect(isDimmed(await openGallery(screen))).toBe(false);
  });

  it('keeps Gallery enabled for Gemini 2.5 Flash Lite (real catalog Vision)', async () => {
    activateCloudModel('gemini-2.5-flash-lite');

    const screen = render(<ChatScreen />, {withNavigation: true});

    expect(isDimmed(await openGallery(screen))).toBe(false);
  });

  it('keeps Gallery dimmed for a non-vision Cloud model (Ling 3.0 Flash)', async () => {
    activateCloudModel('ling-3.0-flash');

    const screen = render(<ChatScreen />, {withNavigation: true});

    expect(isDimmed(await openGallery(screen))).toBe(true);
  });
});
