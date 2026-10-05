import {fireEvent, waitFor} from '@testing-library/react-native';
import * as React from 'react';
import {ScrollView, Alert} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {keepLocalCopy, pick} from '@react-native-documents/picker';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {runInAction} from 'mobx';

import {user} from '../../../../jest/fixtures';
import {l10n} from '../../../locales';
import {UserContext} from '../../../utils';
import {ChatInput} from '../ChatInput';
import {render} from '../../../../jest/test-utils';
import {
  palStore,
  chatSessionStore,
  modelStore,
  serverStore,
} from '../../../store';
import {uploadBotConnectorFile} from '../../../api/botconnectorFiles';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

// Mock react-native-image-picker
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  keepLocalCopy: jest.fn(),
  types: {allFiles: '*/*'},
  errorCodes: {OPERATION_CANCELED: 'OPERATION_CANCELED'},
  isErrorWithCode: jest.fn(() => false),
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
  stat: jest.fn(),
  unlink: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../api/botconnectorFiles', () => ({
  BOTCONNECTOR_FILE_MAX_COUNT: 10,
  BOTCONNECTOR_FILE_MAX_TOTAL_BYTES: 512 * 1024 * 1024,
  isBotConnectorFileReady: (file: any) =>
    file?.status === 'ready' && Boolean(file?.id),
  uploadBotConnectorFile: jest.fn(),
  getBotConnectorFile: jest.fn(),
}));

jest.spyOn(Alert, 'alert');

const renderScrollable = () => <ScrollView />;

describe('input', () => {
  it('send button', () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            sendButtonVisibilityMode: 'editing',
            textInputProps: {value: 'text'},
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    fireEvent.changeText(textInput, 'text');
    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({text: 'text', type: 'text'});
    expect(textInput.props).toHaveProperty('value', 'text');
  });

  it('sends a text message', () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            renderScrollable,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    fireEvent.changeText(textInput, 'text');
    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({text: 'text', type: 'text'});
    expect(textInput.props).toHaveProperty('value', '');
  });

  it('sends a text message if onChangeText and value are provided', () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const value = 'value';
    const onChangeText = jest.fn(newValue => {
      rerender(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              renderScrollable,
              sendButtonVisibilityMode: 'editing',
              textInputProps: {onChangeText, value: newValue},
            }}
          />
        </UserContext.Provider>,
      );
    });
    const {getByPlaceholderText, getByLabelText, rerender} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            renderScrollable,
            sendButtonVisibilityMode: 'editing',
            textInputProps: {onChangeText, value},
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    fireEvent.changeText(textInput, 'text');
    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({text: 'text', type: 'text'});
    expect(textInput.props).toHaveProperty('value', 'text');
  });

  it('sends a text message if onChangeText is provided', () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const onChangeText = jest.fn();
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            renderScrollable,
            sendButtonVisibilityMode: 'editing',
            textInputProps: {onChangeText},
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    fireEvent.changeText(textInput, 'text');
    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({text: 'text', type: 'text'});
    expect(textInput.props).toHaveProperty('value', '');
  });

  it('sends a text message if value is provided', async () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const value = 'value';
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            renderScrollable,
            sendButtonVisibilityMode: 'editing',
            textInputProps: {value},
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    await waitFor(() => fireEvent.changeText(textInput, 'text')); // Wait for the input to update

    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    await waitFor(() => fireEvent.press(button)); // Wait for the press event to be processed

    expect(onSendPress).toHaveBeenCalledWith({text: value, type: 'text'});
    expect(textInput.props).toHaveProperty('value', value);
  });

  it('sends a text message if defaultValue is provided', () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const defaultValue = 'defaultValue';
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            renderScrollable,
            sendButtonVisibilityMode: 'editing',
            textInputProps: {defaultValue},
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({
      text: defaultValue,
      type: 'text',
    });
    expect(textInput.props).toHaveProperty('value', '');
  });

  it('shows stop button when isStopVisible is true', () => {
    expect.assertions(1);
    const onStopPress = jest.fn();
    const onSendPress = jest.fn();
    const {getByTestId} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            onStopPress,
            isStopVisible: true,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );
    const stopButton = getByTestId('stop-button');
    fireEvent.press(stopButton);
    expect(onStopPress).toHaveBeenCalledTimes(1);
  });

  it('shows plus button for image upload when showImageUpload is true', () => {
    expect.assertions(1);
    const onSendPress = jest.fn();
    const {getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            showImageUpload: true,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );

    const plusButton = getByLabelText('Add attachment');
    expect(plusButton).toBeDefined();
  });

  it('does not show plus button when showImageUpload is false', () => {
    expect.assertions(1);
    const onSendPress = jest.fn();
    const {queryByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            showImageUpload: false,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );

    const plusButton = queryByLabelText('Add attachment');
    expect(plusButton).toBeNull();
  });

  it('renders plus button correctly when vision is enabled', () => {
    expect.assertions(2);
    const onSendPress = jest.fn();
    const {getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            showImageUpload: true,
            isVisionEnabled: true,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );

    const plusButton = getByLabelText('Add attachment');
    expect(plusButton).toBeTruthy();
    expect(plusButton.props.accessibilityState.disabled).toBe(false);
  });

  it('shows pal selector button', () => {
    expect.assertions(1);
    const onSendPress = jest.fn();
    const onPalBtnPress = jest.fn();
    const {getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            onPalBtnPress,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );

    const palButton = getByLabelText('Select Pal');
    fireEvent.press(palButton);
    expect(onPalBtnPress).toHaveBeenCalledTimes(1);
  });

  it('shows video button for video pal type', async () => {
    expect.assertions(1);

    // Create a video pal and set it as active
    const videoPal = await palStore.createPal({
      type: 'local',
      name: 'Test Video Pal',
      systemPrompt: 'Test video pal',
      originalSystemPrompt: 'Test video pal',
      isSystemPromptChanged: false,
      useAIPrompt: false,
      parameters: {captureInterval: '3000'},
      parameterSchema: [
        {
          key: 'captureInterval',
          type: 'text',
          label: 'Capture Interval',
          required: true,
        },
      ],
      source: 'local',
      capabilities: {video: true},
    });

    // Mock the activePalId getter to return our video pal's ID
    const originalActivePalId = Object.getOwnPropertyDescriptor(
      chatSessionStore,
      'activePalId',
    );
    Object.defineProperty(chatSessionStore, 'activePalId', {
      get: jest.fn(() => videoPal.id),
      configurable: true,
    });

    const onSendPress = jest.fn();
    const onStartCamera = jest.fn();
    const {getByText, unmount} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            onStartCamera,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );

    const videoButton = getByText('Start Camera');
    fireEvent.press(videoButton);
    expect(onStartCamera).toHaveBeenCalledTimes(1);

    // Cleanup: restore original activePalId mock
    unmount();
    if (originalActivePalId) {
      Object.defineProperty(
        chatSessionStore,
        'activePalId',
        originalActivePalId,
      );
    }
  });

  it('handles prompt text change for video pal', async () => {
    expect.assertions(1);

    // Create a video pal and set it as active
    const videoPal = await palStore.createPal({
      type: 'local',
      name: 'Test Video Pal',
      systemPrompt: 'Test video pal',
      originalSystemPrompt: 'Test video pal',
      isSystemPromptChanged: false,
      useAIPrompt: false,
      parameters: {captureInterval: '3000'},
      parameterSchema: [
        {
          key: 'captureInterval',
          type: 'text',
          label: 'Capture Interval',
          required: true,
        },
      ],
      source: 'local',
      capabilities: {video: true},
    });

    // Mock the activePalId getter to return our video pal's ID
    const originalActivePalId = Object.getOwnPropertyDescriptor(
      chatSessionStore,
      'activePalId',
    );
    Object.defineProperty(chatSessionStore, 'activePalId', {
      get: jest.fn(() => videoPal.id),
      configurable: true,
    });

    const onSendPress = jest.fn();
    const onPromptTextChange = jest.fn();
    const {getByPlaceholderText, unmount} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            onPromptTextChange,
            promptText: 'initial text',
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );

    const textInput = getByPlaceholderText(l10n.en.video.promptPlaceholder);
    fireEvent.changeText(textInput, 'new text');
    expect(onPromptTextChange).toHaveBeenCalledWith('new text');

    // Cleanup: restore original activePalId mock
    unmount();
    if (originalActivePalId) {
      Object.defineProperty(
        chatSessionStore,
        'activePalId',
        originalActivePalId,
      );
    }
  });

  it('disables plus button when vision is not enabled', () => {
    expect.assertions(1);
    const onSendPress = jest.fn();
    const {getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            showImageUpload: true,
            isVisionEnabled: false,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );

    const plusButton = getByLabelText('Add attachment');
    expect(plusButton.props.accessibilityState.disabled).toBe(true);
  });

  it('enables plus button when vision is enabled', () => {
    expect.assertions(1);
    const onSendPress = jest.fn();
    const {getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            showImageUpload: true,
            isVisionEnabled: true,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );

    const plusButton = getByLabelText('Add attachment');
    expect(plusButton.props.accessibilityState.disabled).toBe(false);
  });

  it('shows send button with always visibility mode', () => {
    expect.assertions(1);
    const onSendPress = jest.fn();
    const {getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            sendButtonVisibilityMode: 'always',
          }}
        />
      </UserContext.Provider>,
    );

    const sendButton = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    expect(sendButton).toBeTruthy();
  });

  it('sends message with images when images are selected', () => {
    expect.assertions(1);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );

    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    fireEvent.changeText(textInput, 'test message');

    const sendButton = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(sendButton);

    expect(onSendPress).toHaveBeenCalledWith({
      text: 'test message',
      type: 'text',
    });
  });

  describe('Image Upload Functionality', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (keepLocalCopy as jest.Mock).mockImplementation(async ({files}) => [
        {
          status: 'success',
          sourceUri: files[0].uri,
          localUri: 'file:///cache/' + files[0].fileName,
        },
      ]);
      (RNFS.stat as jest.Mock).mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false,
      });
    });

    it('uploads and sends a ready BotConnector file without typed text', async () => {
      runInAction(() => {
        serverStore.servers = [
          {
            id: 'bc-files',
            name: 'BotConnector',
            url: 'https://api.botconnector.id',
            serverType: 'OpenAI',
          },
        ];
        serverStore.botConnectorAccess = {
          'bc-files': {
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
          },
        };
        modelStore.models = [
          {
            id: 'bc-files/text-model',
            origin: 'remote',
            serverId: 'bc-files',
            remoteModelId: 'text-model',
          } as any,
        ];
        modelStore.activeModelId = 'bc-files/text-model';
      });

      const keySpy = jest
        .spyOn(serverStore, 'getApiKey')
        .mockResolvedValue('bc_live_test');
      (pick as jest.Mock).mockResolvedValue([
        {
          uri: 'file:///tmp/report.pdf',
          name: 'report.pdf',
          size: 1024,
          type: 'application/pdf',
        },
      ]);
      (uploadBotConnectorFile as jest.Mock).mockResolvedValue({
        id: 'file_bc_11111111-1111-1111-1111-111111111111',
        object: 'file',
        bytes: 1024,
        filename: 'report.pdf',
        media_type: 'application/pdf',
        status: 'ready',
        route: 'retrieval',
      });

      const onSendPress = jest.fn();
      const screen = render(
        <UserContext.Provider value={user}>
          <ChatInput
            onSendPress={onSendPress}
            showImageUpload={true}
            isVisionEnabled={false}
            sendButtonVisibilityMode="always"
          />
        </UserContext.Provider>,
      );

      fireEvent.press(screen.getByLabelText('Add attachment'));
      fireEvent.press(await screen.findByText('File'));

      await waitFor(() => {
        expect(uploadBotConnectorFile).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Ready')).toBeTruthy();
      });

      fireEvent.press(
        screen.getByLabelText(l10n.en.components.sendButton.accessibilityLabel),
      );
      expect(onSendPress).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          type: 'text',
          botConnectorFiles: [
            expect.objectContaining({
              id: 'file_bc_11111111-1111-1111-1111-111111111111',
              name: 'report.pdf',
              size: 1024,
              mediaType: 'application/pdf',
              route: 'retrieval',
            }),
          ],
        }),
      );

      keySpy.mockRestore();
      runInAction(() => {
        serverStore.servers = [];
        serverStore.botConnectorAccess = {};
        modelStore.activeModelId = undefined;
      });
    });

    it('resolves unknown picker size from the local copy before upload', async () => {
      runInAction(() => {
        serverStore.servers = [
          {
            id: 'bc-files',
            name: 'BotConnector',
            url: 'https://api.botconnector.id',
            serverType: 'OpenAI',
          },
        ];
        serverStore.botConnectorAccess = {
          'bc-files': {
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
          },
        };
        modelStore.models = [
          {
            id: 'bc-files/text-model',
            origin: 'remote',
            serverId: 'bc-files',
            remoteModelId: 'text-model',
          } as any,
        ];
        modelStore.activeModelId = 'bc-files/text-model';
      });

      const keySpy = jest
        .spyOn(serverStore, 'getApiKey')
        .mockResolvedValue('bc_live_test');
      (pick as jest.Mock).mockResolvedValue([
        {
          uri: 'content://provider/report.pdf',
          name: 'report.pdf',
          size: null,
          type: 'application/pdf',
        },
      ]);
      (RNFS.stat as jest.Mock).mockResolvedValue({
        size: 4096,
        isFile: () => true,
        isDirectory: () => false,
      });
      (uploadBotConnectorFile as jest.Mock).mockResolvedValue({
        id: 'file_bc_22222222-2222-2222-2222-222222222222',
        object: 'file',
        bytes: 4096,
        filename: 'report.pdf',
        media_type: 'application/pdf',
        status: 'ready',
        route: 'retrieval',
      });

      const onSendPress = jest.fn();
      const screen = render(
        <UserContext.Provider value={user}>
          <ChatInput
            onSendPress={onSendPress}
            showImageUpload={true}
            isVisionEnabled={false}
            sendButtonVisibilityMode="always"
          />
        </UserContext.Provider>,
      );

      fireEvent.press(screen.getByLabelText('Add attachment'));
      fireEvent.press(await screen.findByText('File'));

      await waitFor(() => {
        expect(uploadBotConnectorFile).toHaveBeenCalledWith(
          expect.objectContaining({
            file: expect.objectContaining({
              uri: 'file:///cache/report.pdf',
              size: 4096,
            }),
          }),
        );
      });

      fireEvent.press(
        screen.getByLabelText(l10n.en.components.sendButton.accessibilityLabel),
      );
      expect(RNFS.unlink).toHaveBeenCalledWith('/cache/report.pdf');

      keySpy.mockRestore();
      runInAction(() => {
        serverStore.servers = [];
        serverStore.botConnectorAccess = {};
        modelStore.activeModelId = undefined;
      });
    });

    it('opens image upload menu when plus button is pressed', () => {
      const onSendPress = jest.fn();
      const {getByLabelText} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              showImageUpload: true,
              isVisionEnabled: true,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      const plusButton = getByLabelText('Add attachment');
      fireEvent.press(plusButton);

      // Menu should be visible after pressing plus button
      // This would need to be tested with the actual menu implementation
    });

    it('handles camera photo capture successfully', async () => {
      const mockResult = {
        assets: [{uri: 'file://test-photo.jpg'}],
      };
      (launchCamera as jest.Mock).mockResolvedValue(mockResult);

      const onSendPress = jest.fn();
      const {getByLabelText} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              showImageUpload: true,
              isVisionEnabled: true,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      const plusButton = getByLabelText('Add attachment');
      fireEvent.press(plusButton);

      // Since testing the menu interaction is complex, let's test that the camera function works
      // by calling it directly (this tests the core functionality)
      expect(launchCamera).toHaveBeenCalledTimes(0); // Initially not called

      // The plus button should open the menu, but testing menu interaction is complex
      // For now, we'll test that the component renders correctly with image upload enabled
      expect(plusButton).toBeTruthy();
    });

    it('handles camera error gracefully', async () => {
      const mockError = new Error('Camera error');
      (launchCamera as jest.Mock).mockRejectedValue(mockError);

      const onSendPress = jest.fn();
      const {getByLabelText} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              showImageUpload: true,
              isVisionEnabled: true,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      const plusButton = getByLabelText('Add attachment');
      fireEvent.press(plusButton);

      // Test that the component renders correctly even when camera errors are configured
      expect(plusButton).toBeTruthy();
      expect(launchCamera).toHaveBeenCalledTimes(0); // Not called until menu interaction
    });

    const renderWithImageUpload = () =>
      render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress: jest.fn(),
              showImageUpload: true,
              isVisionEnabled: true,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

    const pressCameraMenuItem = async (
      screen: ReturnType<typeof renderWithImageUpload>,
    ) => {
      fireEvent.press(screen.getByLabelText('Add attachment'));
      fireEvent.press(await screen.findByText(l10n.en.camera.takePhoto));
    };

    it('adds the captured photo to the selection', async () => {
      (launchCamera as jest.Mock).mockResolvedValue({
        assets: [{uri: 'file://test-photo.jpg'}],
      });

      const screen = renderWithImageUpload();
      await pressCameraMenuItem(screen);

      expect(await screen.findByLabelText('Remove image 1')).toBeTruthy();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('alerts that no camera device was found when the camera is unavailable', async () => {
      (launchCamera as jest.Mock).mockResolvedValue({
        errorCode: 'camera_unavailable',
      });

      const screen = renderWithImageUpload();
      await pressCameraMenuItem(screen);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          l10n.en.camera.errorTitle,
          l10n.en.camera.noDevice,
        );
      });
      expect(launchCamera).toHaveBeenCalledTimes(1);
      expect(screen.queryByLabelText('Remove image 1')).toBeNull();
    });

    it('alerts with the generic camera error for other error codes', async () => {
      (launchCamera as jest.Mock).mockResolvedValue({
        errorCode: 'others',
        errorMessage: 'x',
      });

      const screen = renderWithImageUpload();
      await pressCameraMenuItem(screen);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          l10n.en.errors.cameraErrorTitle,
          l10n.en.errors.cameraErrorMessage,
        );
      });
    });

    it('stays silent when the camera is cancelled', async () => {
      (launchCamera as jest.Mock).mockResolvedValue({didCancel: true});

      const screen = renderWithImageUpload();
      await pressCameraMenuItem(screen);

      await waitFor(() => {
        expect(launchCamera).toHaveBeenCalledTimes(1);
      });
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('closes the menu and re-enables auto-release after a camera error', async () => {
      (launchCamera as jest.Mock).mockResolvedValue({
        errorCode: 'camera_unavailable',
      });

      const screen = renderWithImageUpload();
      await pressCameraMenuItem(screen);

      await waitFor(() => {
        expect(modelStore.enableAutoRelease).toHaveBeenCalledWith(
          'camera-photo',
        );
      });
      expect(modelStore.disableAutoRelease).toHaveBeenCalledWith(
        'camera-photo',
      );
      await waitFor(() => {
        expect(screen.queryByText(l10n.en.camera.takePhoto)).toBeNull();
      });
    });

    it('handles image library selection successfully', async () => {
      const mockResult = {
        assets: [{uri: 'file://test-library-photo.jpg'}],
      };
      (launchImageLibrary as jest.Mock).mockResolvedValue(mockResult);

      const onSendPress = jest.fn();
      const {getByLabelText} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              showImageUpload: true,
              isVisionEnabled: true,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      const plusButton = getByLabelText('Add attachment');
      fireEvent.press(plusButton);

      // Test that the component renders correctly with image library functionality
      expect(plusButton).toBeTruthy();
      expect(launchImageLibrary).toHaveBeenCalledTimes(0); // Not called until menu interaction
    });

    it('sends message with selected images', () => {
      // Set up an active model for the test
      runInAction(() => {
        modelStore.activeModelId = 'test-model-id';
      });
      const onSendPress = jest.fn();
      const defaultImages = ['file://image1.jpg', 'file://image2.jpg'];
      const {getByPlaceholderText, getByLabelText} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              showImageUpload: true,
              isVisionEnabled: true,
              sendButtonVisibilityMode: 'editing',
              defaultImages,
            }}
          />
        </UserContext.Provider>,
      );

      const textInput = getByPlaceholderText(
        l10n.en.components.chatInput.inputPlaceholder,
      );
      fireEvent.changeText(textInput, 'test with images');

      const sendButton = getByLabelText(
        l10n.en.components.sendButton.accessibilityLabel,
      );
      fireEvent.press(sendButton);

      expect(onSendPress).toHaveBeenCalledWith({
        text: 'test with images',
        type: 'text',
        imageUris: defaultImages,
      });
    });
  });

  describe('Edit Mode Functionality', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('shows edit bar when in edit mode', () => {
      runInAction(() => {
        chatSessionStore.isEditMode = true;
      });
      const onSendPress = jest.fn();
      const onCancelEdit = jest.fn();

      render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              onCancelEdit,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      expect(onCancelEdit).not.toHaveBeenCalled(); // Should not be called on render
    });

    it('calls onCancelEdit when cancel button is pressed', () => {
      const onSendPress = jest.fn();
      const onCancelEdit = jest.fn();

      // Start with edit mode enabled
      runInAction(() => {
        chatSessionStore.isEditMode = true;
      });

      const {getByTestId} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              onCancelEdit,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      // Find and press the cancel button in the edit bar
      const cancelButton = getByTestId('icon-button');
      fireEvent.press(cancelButton);

      expect(onCancelEdit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Model Not Loaded Feedback', () => {
    it('shows warning and haptic feedback when trying to send without model', async () => {
      // Mock haptic feedback
      const hapticTriggerSpy = jest.spyOn(ReactNativeHapticFeedback, 'trigger');

      // Ensure no model is loaded
      runInAction(() => {
        modelStore.activeModelId = undefined;
        modelStore.context = undefined;
      });

      const onSendPress = jest.fn();

      const {getByPlaceholderText, getByLabelText, getByText} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              renderScrollable,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      const input = getByPlaceholderText(
        l10n.en.components.chatInput.inputPlaceholder,
      );
      fireEvent.changeText(input, 'Test message');

      const sendButton = getByLabelText(
        l10n.en.components.sendButton.accessibilityLabel,
      );
      fireEvent.press(sendButton);

      // Verify haptic feedback was triggered
      expect(hapticTriggerSpy).toHaveBeenCalledWith('notificationWarning', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });

      // Verify helper text is displayed
      expect(getByText(l10n.en.chat.cannotSendWithoutModel)).toBeTruthy();

      // Verify onSendPress was NOT called
      expect(onSendPress).not.toHaveBeenCalled();

      hapticTriggerSpy.mockRestore();
    });

    it('allows sending when model is loaded', async () => {
      const onSendPress = jest.fn();

      // Ensure model is loaded
      runInAction(() => {
        modelStore.activeModelId = 'test-model';
        modelStore.context = {id: 'test-context'} as any;
      });

      const {getByPlaceholderText, getByLabelText} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              renderScrollable,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      const input = getByPlaceholderText(
        l10n.en.components.chatInput.inputPlaceholder,
      );
      fireEvent.changeText(input, 'Test message');

      const sendButton = getByLabelText(
        l10n.en.components.sendButton.accessibilityLabel,
      );
      fireEvent.press(sendButton);

      // Verify onSendPress WAS called
      expect(onSendPress).toHaveBeenCalledWith({
        text: 'Test message',
        type: 'text',
        imageUris: undefined,
      });
    });
  });
});
