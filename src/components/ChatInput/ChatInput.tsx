import * as React from 'react';
import {
  TextInput,
  TextInputProps,
  View,
  Animated,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
} from '@react-native-documents/picker';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {useCameraPermission} from 'react-native-vision-camera';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {observer} from 'mobx-react';
import {IconButton, ProgressBar, Text} from 'react-native-paper';

import {hasVideoCapability} from '../../utils/pal-capabilities';

import {
  ChevronUpIcon,
  VideoRecorderIcon,
  PlusIcon,
  AtomIcon,
  GlobeIcon,
  XSmIcon,
} from '../../assets/icons';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {
  botConnectorAuthStore,
  chatSessionStore,
  modelStore,
  palStore,
  serverStore,
  uiStore,
} from '../../store';

import {MessageType} from '../../utils/types';
import {L10nContext, UserContext} from '../../utils';
import {t} from '../../locales';
import {recognizeSpeechOnce} from '../../utils/speechRecognition';
import {isBotConnectorApiUrl} from '../../config/botconnector';
import {
  CapabilityDenialInput,
  CapabilityDenialReason,
  resolveCapabilityDenial,
} from '../../utils/capabilityDenial';
import {
  BOTCONNECTOR_FILE_MAX_COUNT,
  BOTCONNECTOR_FILE_MAX_TOTAL_BYTES,
  BOTCONNECTOR_FILE_POLL_DEADLINE_MS,
  BOTCONNECTOR_FILE_POLL_ERROR_LIMIT,
  BotConnectorFile,
  BotConnectorFileStatusError,
  getBotConnectorFile,
  isBotConnectorFileReady,
  isKnownBotConnectorFileStatus,
  isTerminalBotConnectorFileStatus,
  nextFilePollDelayMs,
  resolveFileFailureMessage,
  uploadBotConnectorFile,
} from '../../api/botconnectorFiles';

import {SendButton, StopButton, Menu, VoiceChip} from '..';

export interface ChatInputTopLevelProps {
  /** Whether the AI is currently streaming tokens */
  isStreaming?: boolean;
  /** Will be called on {@link SendButton} tap. Has {@link MessageType.PartialText} which can
   * be transformed to {@link MessageType.Text} and added to the messages list. */
  onSendPress: (message: MessageType.PartialText) => void;
  onStopPress?: () => void;
  onCancelEdit?: () => void;
  onPalBtnPress?: () => void;
  isStopVisible?: boolean;
  /** Controls the visibility behavior of the {@link SendButton} based on the
   * `TextInput` state. Defaults to `editing`. */
  sendButtonVisibilityMode?: 'always' | 'editing';
  textInputProps?: TextInputProps;
  isPickerVisible?: boolean;
  inputBackgroundColor?: string;
  /** External control for selected images (for edit mode) */
  defaultImages?: string[];
  onDefaultImagesChange?: (images: string[]) => void;

  /** Camera-specific props */
  isCameraActive?: boolean;
  onStartCamera?: () => void;
  /** For camera input, allows direct editing of the prompt text */
  promptText?: string;
  onPromptTextChange?: (text: string) => void;
  /** Whether to show the image upload button */
  showImageUpload?: boolean;
  isVisionEnabled?: boolean;
  /** Whether to show the Internet search toggle button */
  showInternetToggle?: boolean;
  /** Whether Internet search is available for the active account/model. */
  isInternetAvailable?: boolean;
  /** Whether explicit Internet mode is currently enabled */
  isInternetEnabled?: boolean;
  /** Callback when explicit Internet mode is toggled */
  onInternetToggle?: (enabled: boolean) => void;
  /** Called when the visible globe is pressed but Internet is unavailable. */
  onInternetUnavailable?: () => void;
  /** Whether to show the thinking toggle button */
  showThinkingToggle?: boolean;
  /** Whether thinking mode is currently enabled */
  isThinkingEnabled?: boolean;
  /** Callback when thinking toggle is pressed */
  onThinkingToggle?: (enabled: boolean) => void;
  /** Whether the model supports graded reasoning effort (axis 2) */
  supportsEffort?: boolean;
  /** The graded effort value set, e.g. ['low','medium','high'] */
  effortValues?: string[];
  /** Currently selected reasoning effort (when graded) */
  reasoningEffort?: string;
  /** Callback to cycle the graded effort state (off -> values -> off) */
  onEffortCycle?: () => void;
}

export interface ChatInputAdditionalProps {
  /** Camera-specific props */
  isCameraActive?: boolean;
  onStartCamera?: () => void;
  /** For camera input, allows direct editing of the prompt text */
  promptText?: string;
  onPromptTextChange?: (text: string) => void;
  /** Whether to show the image upload button */
  showImageUpload?: boolean;
  /** Whether to show the Internet search toggle button */
  showInternetToggle?: boolean;
  /** Whether Internet search is available for the active account/model. */
  isInternetAvailable?: boolean;
  /** Whether explicit Internet mode is currently enabled */
  isInternetEnabled?: boolean;
  /** Callback when explicit Internet mode is toggled */
  onInternetToggle?: (enabled: boolean) => void;
  /** Called when the visible globe is pressed but Internet is unavailable. */
  onInternetUnavailable?: () => void;
  /** Whether to show the thinking toggle button */
  showThinkingToggle?: boolean;
  /** Whether thinking mode is currently enabled */
  isThinkingEnabled?: boolean;
  /** Callback when thinking toggle is pressed */
  onThinkingToggle?: (enabled: boolean) => void;
  /** Whether the model supports graded reasoning effort (axis 2) */
  supportsEffort?: boolean;
  /** The graded effort value set, e.g. ['low','medium','high'] */
  effortValues?: string[];
  /** Currently selected reasoning effort (when graded) */
  reasoningEffort?: string;
  /** Callback to cycle the graded effort state (off -> values -> off) */
  onEffortCycle?: () => void;
}

export type ChatInputProps = ChatInputTopLevelProps & ChatInputAdditionalProps;

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

/** Bottom bar input component with a text input, attachment and
 * send buttons inside. By default hides send button when text input is empty. */
export const ChatInput = observer(
  ({
    isStreaming = false,
    onSendPress,
    onStopPress,
    onCancelEdit,
    onPalBtnPress,
    isStopVisible,
    sendButtonVisibilityMode,
    textInputProps,
    isPickerVisible,
    inputBackgroundColor,
    isCameraActive = false,
    onStartCamera,
    promptText,
    onPromptTextChange,
    isVisionEnabled = false,
    defaultImages,
    onDefaultImagesChange,
    showInternetToggle = false,
    isInternetAvailable = true,
    isInternetEnabled = false,
    onInternetToggle,
    onInternetUnavailable,
    showThinkingToggle = false,
    isThinkingEnabled = false,
    onThinkingToggle,
    supportsEffort = false,
    effortValues = [],
    reasoningEffort,
    onEffortCycle,
  }: ChatInputProps) => {
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const user = React.useContext(UserContext);
    const inputRef = React.useRef<TextInput>(null);
    const editBarHeight = React.useRef(new Animated.Value(0)).current;
    const iconRotation = React.useRef(new Animated.Value(0)).current;
    const activePalId = chatSessionStore.activePalId;
    const currentActivePal = palStore.pals.find(pal => pal.id === activePalId);

    // Camera permission hook from react-native-vision-camera
    const {hasPermission, requestPermission} = useCameraPermission();

    const hasActiveModel = !!modelStore.activeModelId;
    const activeServer = modelStore.activeModel?.serverId
      ? serverStore.servers.find(
          server => server.id === modelStore.activeModel?.serverId,
        )
      : undefined;
    const isBotConnectorCloud = Boolean(
      activeServer && isBotConnectorApiUrl(activeServer.url),
    );
    const activeAccess = isBotConnectorCloud
      ? serverStore.botConnectorAccess[activeServer!.id]
      : undefined;
    const activeAccessState = isBotConnectorCloud
      ? serverStore.botConnectorAccessState[activeServer!.id]
      : undefined;
    // Per-axis gate only: the legacy coarse `access` flag must never decide
    // whether Files is offered (server reports files=false for plans without
    // it, with reasons.files explaining why).
    const botConnectorFilesEnabled = Boolean(
      activeAccess && activeAccess.capabilities.files === true,
    );

    // Use `defaultValue` if provided
    const [text, setText] = React.useState(textInputProps?.defaultValue ?? '');
    // State for selected images - use external control when provided
    const [internalSelectedImages, setInternalSelectedImages] = React.useState<
      string[]
    >([]);
    const selectedImages = defaultImages ?? internalSelectedImages;
    const setSelectedImages =
      onDefaultImagesChange ?? setInternalSelectedImages;
    const [selectedFiles, setSelectedFiles] = React.useState<
      BotConnectorFile[]
    >([]);
    const selectedFileKeysRef = React.useRef<Set<string>>(new Set());
    selectedFileKeysRef.current = new Set(selectedFiles.map(file => file.uri));
    // State for image upload menu
    const [showImageUploadMenu, setShowImageUploadMenu] = React.useState(false);
    // State for showing "model not loaded" helper text
    const [showModelWarning, setShowModelWarning] = React.useState(false);
    const [isVoiceInputActive, setIsVoiceInputActive] = React.useState(false);
    const isEditMode = chatSessionStore.isEditMode;

    const styles = createStyles({theme, isEditMode});

    // For camera input, use promptText if provided
    const isVideoCapable =
      currentActivePal && hasVideoCapability(currentActivePal);
    const value =
      isVideoCapable && promptText !== undefined
        ? promptText
        : (textInputProps?.value ?? text);

    React.useEffect(() => {
      if (isEditMode) {
        // Animate edit bar height
        Animated.spring(editBarHeight, {
          toValue: 28,
          useNativeDriver: false,
          friction: 8,
        }).start();
        // Focus input
        inputRef.current?.focus();
      } else {
        Animated.spring(editBarHeight, {
          toValue: 0,
          useNativeDriver: false,
          friction: 8,
        }).start();
        onCancelEdit?.();
      }
    }, [isEditMode, editBarHeight, onCancelEdit]);

    React.useEffect(() => {
      Animated.spring(iconRotation, {
        toValue: isPickerVisible ? 1 : 0,
        useNativeDriver: true,
        friction: 8,
      }).start();
    }, [isPickerVisible, iconRotation]);

    const handleChangeText = (newText: string) => {
      if (isVideoCapable && onPromptTextChange) {
        onPromptTextChange(newText);
      } else {
        setText(newText);
        textInputProps?.onChangeText?.(newText);
      }
    };

    const handleVoiceInput = async () => {
      if (isVoiceInputActive || isStreaming || isCameraActive) {
        return;
      }
      setIsVoiceInputActive(true);
      try {
        const transcript = (await recognizeSpeechOnce(uiStore.language)).trim();
        if (transcript) {
          const next = value.trim()
            ? `${value.trimEnd()} ${transcript}`
            : transcript;
          handleChangeText(next);
          inputRef.current?.focus();
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : l10n.components.voiceInput.failed;
        if (/permission/i.test(message)) {
          // Denied permission: explain and offer the Settings shortcut.
          Alert.alert(
            l10n.components.voiceInput.title,
            l10n.components.voiceInput.permissionDenied,
            [
              {text: l10n.common.cancel, style: 'cancel'},
              {
                text: l10n.components.voiceInput.openSettings,
                onPress: () => Linking.openSettings().catch(() => undefined),
              },
            ],
          );
        } else if (!/cancel/i.test(message)) {
          Alert.alert(l10n.components.voiceInput.title, message);
        }
      } finally {
        setIsVoiceInputActive(false);
      }
    };

    const readyFiles = botConnectorFilesEnabled
      ? selectedFiles.filter(isBotConnectorFileReady)
      : [];
    const hasPendingFiles =
      botConnectorFilesEnabled &&
      selectedFiles.some(
        file => !isTerminalBotConnectorFileStatus(file.status),
      );

    const handleSend = () => {
      const trimmedValue = value.trim();
      if ((trimmedValue || readyFiles.length > 0) && !hasPendingFiles) {
        // Check if model is loaded before sending
        if (!hasActiveModel) {
          ReactNativeHapticFeedback.trigger(
            'notificationWarning',
            hapticOptions,
          );
          setShowModelWarning(true);
          setTimeout(() => setShowModelWarning(false), 3000);
          return;
        }

        onSendPress({
          text: trimmedValue,
          type: 'text',
          imageUris: selectedImages.length > 0 ? selectedImages : undefined,
          botConnectorFiles:
            readyFiles.length > 0
              ? readyFiles.map(file => ({
                  id: file.id!,
                  name: file.name,
                  size: file.size,
                  mediaType: file.mediaType,
                  route: file.route,
                }))
              : undefined,
        });
        setText('');
        setSelectedImages([]);
        selectedFiles.forEach(cleanupTemporaryFile);
        setSelectedFiles([]);
      }
    };

    // Handle plus button press to show image upload menu
    const handlePlusButtonPress = () => {
      setShowImageUploadMenu(true);
    };

    // Need to figure this out:
    // Handle taking a photo with the camera using react-native-image-picker
    // but with permission checking from react-native-vision-camera
    const handleTakePhoto = async () => {
      try {
        if (!hasPermission) {
          const permissionResult = await requestPermission();
          if (!permissionResult) {
            Alert.alert(
              l10n.camera.permissionTitle,
              l10n.camera.permissionMessage,
            );
            setShowImageUploadMenu(false);
            return;
          }
        }

        // Disable auto-release during camera operation
        // this is only needed on Android.
        modelStore.disableAutoRelease('camera-photo');

        const result = await launchCamera({
          mediaType: 'photo',
          quality: 0.8,
        });

        if (result.errorCode === 'camera_unavailable') {
          Alert.alert(l10n.camera.errorTitle, l10n.camera.noDevice);
        } else if (result.errorCode) {
          Alert.alert(
            l10n.errors.cameraErrorTitle,
            l10n.errors.cameraErrorMessage,
          );
        } else if (
          result.assets &&
          result.assets.length > 0 &&
          result.assets[0].uri
        ) {
          const newImages = [...selectedImages, result.assets[0].uri];
          setSelectedImages(newImages);
        }
        setShowImageUploadMenu(false);
      } catch (error) {
        console.error('Error taking photo:', error);
        Alert.alert(
          l10n.errors.cameraErrorTitle,
          l10n.errors.cameraErrorMessage,
        );
      } finally {
        // Re-enable auto-release after camera operation
        modelStore.enableAutoRelease('camera-photo');
      }
    };

    const visionDenialInput = (
      overrides: Partial<CapabilityDenialInput> = {},
    ): CapabilityDenialInput => ({
      enabled: false,
      isBotConnectorServer: isBotConnectorCloud,
      isSignedIn: botConnectorAuthStore.isSignedIn,
      access: activeAccess,
      accessLoading: activeAccessState?.loading,
      accessError: activeAccessState?.error,
      accessErrorKind: activeAccessState?.errorKind,
      modelSupports: modelStore.activeModelCaps.visionActive === true,
      capability: 'vision',
      ...overrides,
    });

    const showVisionDeniedAlert = (
      denial: CapabilityDenialReason | null,
      retry: () => void,
    ) => {
      const capability = l10n.components.capability;
      const chooseModelButton = {
        text: l10n.camera.chooseVisionModel,
        onPress: () => uiStore.openModelPicker('models'),
      };
      switch (denial) {
        case 'signed_out':
          Alert.alert(capability.signedOutTitle, l10n.camera.visionSignInBody, [
            {text: l10n.common.cancel, style: 'cancel'},
            {
              text: l10n.settings.connectBotConnector,
              onPress: () => {
                botConnectorAuthStore.startLogin().catch(() => undefined);
              },
            },
          ]);
          return;
        case 'checking':
          Alert.alert(capability.checkingTitle, capability.checkingBody);
          return;
        case 'quota_rate_limited':
          Alert.alert(capability.quotaRateTitle, capability.quotaRateBody, [
            {text: l10n.common.cancel, style: 'cancel'},
            {text: capability.retry, onPress: retry},
          ]);
          return;
        case 'quota_balance':
          Alert.alert(
            capability.quotaBalanceTitle,
            capability.quotaBalanceBody,
            [
              {text: l10n.common.cancel, style: 'cancel'},
              {text: capability.retry, onPress: retry},
            ],
          );
          return;
        case 'unavailable':
          Alert.alert(capability.unavailableTitle, capability.unavailableBody, [
            {text: l10n.common.cancel, style: 'cancel'},
            {text: capability.retry, onPress: retry},
          ]);
          return;
        case 'plan_not_included':
          Alert.alert(l10n.camera.visionPlanTitle, l10n.camera.visionPlanBody, [
            {text: l10n.common.cancel, style: 'cancel'},
            chooseModelButton,
          ]);
          return;
        default:
          Alert.alert(l10n.camera.noVisionTitle, l10n.camera.noVisionMessage, [
            {text: l10n.common.cancel, style: 'cancel'},
            chooseModelButton,
          ]);
      }
    };

    const requireVision = (action: () => void) => async () => {
      if (isVisionEnabled) {
        action();
        return;
      }
      setShowImageUploadMenu(false);

      let denial = resolveCapabilityDenial(visionDenialInput());

      // Account state is unknown/failed: revalidate once, then decide with
      // fresh data. A definitive plan answer is never re-fetched here; quota
      // refusals revalidate on demand so Retry can actually retry.
      if (
        denial === 'checking' ||
        denial === 'unavailable' ||
        denial === 'quota_rate_limited' ||
        denial === 'quota_balance'
      ) {
        const fresh = activeServer
          ? await serverStore
              .refreshBotConnectorAccess(activeServer.id)
              .catch(() => undefined)
          : undefined;
        denial = resolveCapabilityDenial(
          visionDenialInput({
            enabled: Boolean(
              fresh &&
                modelStore.activeModelCaps.visionActive === true &&
                fresh.capabilities.vision === true,
            ),
            access: fresh,
            accessLoading: false,
            accessError: !fresh,
          }),
        );
      }

      if (!denial) {
        action();
        return;
      }
      showVisionDeniedAlert(denial, () => {
        requireVision(action)().catch(() => undefined);
      });
    };

    // Accessibility hint for the camera/gallery rows when Vision is denied.
    const visionMenuHint = (() => {
      if (isVisionEnabled) {
        return undefined;
      }
      const denial = resolveCapabilityDenial(visionDenialInput());
      const capability = l10n.components.capability;
      if (denial === 'signed_out') {
        return capability.signedOutTitle;
      }
      if (denial === 'checking') {
        return capability.checkingTitle;
      }
      if (denial === 'unavailable') {
        return capability.unavailableTitle;
      }
      if (denial === 'quota_rate_limited') {
        return capability.quotaRateTitle;
      }
      if (denial === 'quota_balance') {
        return capability.quotaBalanceTitle;
      }
      if (denial === 'plan_not_included') {
        return l10n.camera.visionPlanTitle;
      }
      return l10n.camera.noVisionTitle;
    })();

    // Handle selecting images from the gallery
    const handleSelectImages = async () => {
      try {
        // Disable auto-release during gallery operation
        // this is only needed on Android.
        modelStore.disableAutoRelease('image-gallery');

        const result = await launchImageLibrary({
          mediaType: 'photo',
          selectionLimit: 5, // Allow multiple images
          quality: 0.8,
        });

        if (result.assets && result.assets.length > 0) {
          const newUris = result.assets
            .filter(asset => asset.uri)
            .map(asset => asset.uri as string);

          if (newUris.length > 0) {
            const newImages = [...selectedImages, ...newUris];
            setSelectedImages(newImages);
          }
        }
        setShowImageUploadMenu(false);
      } catch (error) {
        console.error('Error selecting images:', error);
        Alert.alert(
          l10n.errors.galleryErrorTitle,
          l10n.errors.galleryErrorMessage,
        );
      } finally {
        // Re-enable auto-release after gallery operation
        modelStore.enableAutoRelease('image-gallery');
      }
    };

    const localFilePath = (uri: string) =>
      uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;

    const cleanupTemporaryFile = (file: BotConnectorFile) => {
      if (!file.temporary || !file.uri.startsWith('file://')) {
        return;
      }
      RNFS.unlink(localFilePath(file.uri)).catch(() => undefined);
    };

    const updateSelectedFile = (
      localKey: string,
      patch: Partial<BotConnectorFile>,
    ) => {
      setSelectedFiles(current =>
        current.map(file =>
          file.uri === localKey ? {...file, ...patch} : file,
        ),
      );
    };

    // Server-side parsing/OCR of large files can take minutes: poll with the
    // server-hinted cadence (never tighter than 3 s), back off on rate limits
    // without counting them as failures, and stop as soon as the attachment
    // is removed from the composer.
    const pollFileStatus = async (
      localKey: string,
      serverUrl: string,
      apiKey: string,
      fileId: string,
      seed?: {pollAfterMs?: number | null; status?: string},
    ) => {
      const deadline = Date.now() + BOTCONNECTOR_FILE_POLL_DEADLINE_MS;
      let delay = nextFilePollDelayMs({
        serverPollAfterMs: seed?.pollAfterMs,
        status: seed?.status,
      });
      let knownStatus: string | undefined = seed?.status;
      let consecutiveErrors = 0;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, delay));
        if (!selectedFileKeysRef.current.has(localKey)) {
          return; // removed by the user
        }
        try {
          const latest = await getBotConnectorFile({
            serverUrl,
            apiKey,
            fileId,
          });
          consecutiveErrors = 0;
          // The next wait comes from the response: poll_after_ms wins when
          // positive, else waiting_parser polls slower than everything else.
          delay = nextFilePollDelayMs({
            serverPollAfterMs: latest.poll_after_ms,
            status: latest.status,
            previousDelay: delay,
          });
          if (!isKnownBotConnectorFileStatus(latest.status)) {
            // A status newer than this app is not a failure: only the server
            // saying `failed` (or the deadline) may fail an attachment. Keep
            // the last known status on screen and keep polling.
            continue;
          }
          knownStatus = latest.status;
          updateSelectedFile(localKey, {
            id: latest.id,
            name: latest.filename,
            size: latest.bytes,
            mediaType: latest.media_type || 'application/octet-stream',
            status: latest.status,
            route: latest.route,
            parser: latest.parser,
            progress: 1,
            // Failed: prefer the server's own message, else its localized
            // error-code fallback; other statuses clear any stale error.
            error:
              latest.status === 'failed'
                ? resolveFileFailureMessage(
                    latest.error,
                    l10n.components.chatInput,
                  )
                : undefined,
          });
          if (isTerminalBotConnectorFileStatus(latest.status)) {
            return;
          }
        } catch (error) {
          const statusCode =
            error instanceof BotConnectorFileStatusError
              ? error.statusCode
              : undefined;
          if (statusCode === 429) {
            // Rate limiting is not a failure: double the wait, keep polling.
            delay = nextFilePollDelayMs({
              lastStatus: 429,
              previousDelay: delay,
              status: knownStatus,
            });
            continue;
          }
          consecutiveErrors += 1;
          delay = nextFilePollDelayMs({
            attempt: consecutiveErrors,
            previousDelay: delay,
            status: knownStatus,
          });
          // Network drops and 5xx/408 are transient: keep polling until the
          // deadline. Only a definite client error (401/403/404...) that
          // repeats gives up early.
          const isTransient =
            statusCode === undefined || statusCode >= 500 || statusCode === 408;
          if (
            isTransient ||
            consecutiveErrors < BOTCONNECTOR_FILE_POLL_ERROR_LIMIT
          ) {
            continue;
          }
          updateSelectedFile(localKey, {
            status: 'failed',
            error:
              error instanceof Error
                ? error.message
                : l10n.components.chatInput.fileProcessingError,
          });
          return;
        }
      }
      updateSelectedFile(localKey, {
        status: 'failed',
        error: l10n.components.chatInput.fileProcessingTimeout,
      });
    };

    // Localize failures the gateway rejected (esp. oversize 413) and fall
    // back to the localized generic message when nothing usable is left.
    const uploadFailureMessage = (error: unknown): string => {
      const kind = (error as {kind?: string} | null)?.kind;
      if (kind === 'too_large') {
        return l10n.components.chatInput.fileServerTooLargeBody;
      }
      if (kind === 'transient') {
        // 502/503/504 are temporary disruptions, not dead ends: explain the
        // interruption and let the existing Retry button recover.
        return l10n.components.chatInput.fileUploadInterruptedBody;
      }
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return l10n.components.chatInput.fileUploadErrorBody;
    };

    // Mark an upload as failed; a transient disruption also re-verifies the
    // session/capability once (fire-and-forget) before the user retries.
    const failSelectedFile = (localKey: string, error: unknown) => {
      updateSelectedFile(localKey, {
        status: 'failed',
        error: uploadFailureMessage(error),
      });
      if (
        (error as {kind?: string} | null)?.kind === 'transient' &&
        activeServer
      ) {
        serverStore
          .refreshBotConnectorAccess(activeServer.id)
          .catch(() => undefined);
      }
    };

    const retrySelectedFile = async (file: BotConnectorFile) => {
      if (!activeServer || !botConnectorFilesEnabled) {
        return;
      }
      const apiKey = await serverStore.getApiKey(activeServer.id);
      if (!apiKey) {
        updateSelectedFile(file.uri, {
          status: 'failed',
          error: l10n.components.chatInput.fileApiKeyRequired,
        });
        return;
      }
      if (file.id) {
        updateSelectedFile(file.uri, {
          status: 'processing',
          error: undefined,
        });
        pollFileStatus(file.uri, activeServer.url, apiKey, file.id).catch(
          () => undefined,
        );
        return;
      }
      updateSelectedFile(file.uri, {
        status: 'uploading',
        progress: 0,
        error: undefined,
      });
      try {
        const uploaded = await uploadBotConnectorFile({
          serverUrl: activeServer.url,
          apiKey,
          file,
          onProgress: progress => updateSelectedFile(file.uri, {progress}),
        });
        updateSelectedFile(file.uri, {
          id: uploaded.id,
          name: uploaded.filename,
          size: uploaded.bytes,
          mediaType: uploaded.media_type || file.mediaType,
          status: uploaded.status,
          route: uploaded.route,
          parser: uploaded.parser,
          progress: 1,
        });
        if (uploaded.status !== 'ready') {
          pollFileStatus(file.uri, activeServer.url, apiKey, uploaded.id, {
            pollAfterMs: uploaded.poll_after_ms,
            status: uploaded.status,
          }).catch(() => undefined);
        }
      } catch (error) {
        failSelectedFile(file.uri, error);
      }
    };

    const openFilePicker = async () => {
      if (!activeServer) {
        return;
      }

      const apiKey = await serverStore.getApiKey(activeServer.id);
      if (!apiKey) {
        Alert.alert(
          l10n.components.chatInput.fileUploadUnavailableTitle,
          l10n.components.chatInput.sessionUnavailableBody,
        );
        return;
      }

      try {
        const picked = await pick({
          type: [types.allFiles],
          allowMultiSelection: true,
          allowVirtualFiles: false,
          mode: 'import',
        });
        const remaining = Math.max(
          0,
          BOTCONNECTOR_FILE_MAX_COUNT - selectedFiles.length,
        );
        const candidates = picked.slice(0, remaining);
        let acceptedBytes = selectedFiles.reduce(
          (sum, file) => sum + file.size,
          0,
        );
        const accepted: BotConnectorFile[] = [];
        const maxTotalSizeLabel = `${Math.round(
          BOTCONNECTOR_FILE_MAX_TOTAL_BYTES / (1024 * 1024),
        )} MB`;

        for (const item of candidates) {
          const name = item.name || 'file';
          // Reject known-oversized files BEFORE copying them into the cache.
          const reportedSize = Number(item.size || 0);
          if (
            reportedSize > 0 &&
            (reportedSize > BOTCONNECTOR_FILE_MAX_TOTAL_BYTES ||
              acceptedBytes + reportedSize > BOTCONNECTOR_FILE_MAX_TOTAL_BYTES)
          ) {
            Alert.alert(
              l10n.components.chatInput.fileTooLargeTitle,
              t(l10n.components.chatInput.fileTooLargeBody, {
                max: maxTotalSizeLabel,
              }),
            );
            continue;
          }
          const copies = await keepLocalCopy({
            files: [{uri: item.uri, fileName: name}],
            destination: 'cachesDirectory',
          });
          const copy = copies[0];
          if (!copy || copy.status !== 'success') {
            Alert.alert(
              l10n.components.chatInput.fileUploadErrorTitle,
              copy?.status === 'error' && copy.copyError
                ? copy.copyError
                : t(l10n.components.chatInput.fileCopyFailedBody, {name}),
            );
            continue;
          }

          const localUri = copy.localUri;
          let size = Number(item.size || 0);
          try {
            const stat = await RNFS.stat(localFilePath(localUri));
            const actualSize = Number(stat.size || 0);
            if (actualSize > 0) {
              size = actualSize;
            }
          } catch {
            // The strict size check below rejects unknown-size files.
          }

          if (!(size > 0)) {
            RNFS.unlink(localFilePath(localUri)).catch(() => undefined);
            Alert.alert(
              l10n.components.chatInput.fileUploadErrorTitle,
              t(l10n.components.chatInput.fileUnknownSizeBody, {name}),
            );
            continue;
          }
          if (
            size > BOTCONNECTOR_FILE_MAX_TOTAL_BYTES ||
            acceptedBytes + size > BOTCONNECTOR_FILE_MAX_TOTAL_BYTES
          ) {
            RNFS.unlink(localFilePath(localUri)).catch(() => undefined);
            Alert.alert(
              l10n.components.chatInput.fileTooLargeTitle,
              t(l10n.components.chatInput.fileTooLargeBody, {
                max: maxTotalSizeLabel,
              }),
            );
            continue;
          }

          acceptedBytes += size;
          accepted.push({
            uri: localUri,
            name,
            size,
            mediaType: item.type || 'application/octet-stream',
            status: 'uploading',
            progress: 0,
            temporary: true,
          });
        }

        if (accepted.length === 0) {
          setShowImageUploadMenu(false);
          return;
        }
        setSelectedFiles(current => [...current, ...accepted]);
        setShowImageUploadMenu(false);

        // Upload sequentially to avoid multiplying 512 MB transfers on mobile.
        // Processing polling is detached so the next file can start uploading.
        for (const file of accepted) {
          try {
            const uploaded = await uploadBotConnectorFile({
              serverUrl: activeServer.url,
              apiKey,
              file,
              onProgress: progress => updateSelectedFile(file.uri, {progress}),
            });
            updateSelectedFile(file.uri, {
              id: uploaded.id,
              name: uploaded.filename,
              size: uploaded.bytes,
              mediaType: uploaded.media_type || file.mediaType,
              status: uploaded.status,
              route: uploaded.route,
              parser: uploaded.parser,
              progress: 1,
            });
            if (uploaded.status !== 'ready' && uploaded.status !== 'failed') {
              pollFileStatus(file.uri, activeServer.url, apiKey, uploaded.id, {
                pollAfterMs: uploaded.poll_after_ms,
                status: uploaded.status,
              }).catch(() => undefined);
            }
          } catch (error) {
            failSelectedFile(file.uri, error);
          }
        }
      } catch (error) {
        if (
          isErrorWithCode(error) &&
          error.code === errorCodes.OPERATION_CANCELED
        ) {
          return;
        }
        Alert.alert(
          l10n.components.chatInput.fileUploadErrorTitle,
          error instanceof Error
            ? error.message
            : l10n.components.chatInput.fileUploadErrorBody,
        );
      }
    };

    const handleSelectFiles = async () => {
      if (activeServer && botConnectorFilesEnabled) {
        await openFilePicker();
        return;
      }

      setShowImageUploadMenu(false);
      if (!botConnectorAuthStore.isSignedIn) {
        botConnectorAuthStore.startLogin().catch(() => undefined);
        return;
      }
      if (activeServer && isBotConnectorApiUrl(activeServer.url)) {
        const fresh = await serverStore
          .refreshBotConnectorAccess(activeServer.id)
          .catch(() => undefined);
        if (!fresh) {
          // Capability check itself failed (network/backend): say that
          // instead of blaming the account or the plan. 429/402 are quota
          // refusals with their own explanation.
          const capability = l10n.components.capability;
          const errorKind =
            serverStore.botConnectorAccessState[activeServer.id]?.errorKind;
          const isQuota =
            errorKind === 'quota_rate_limited' || errorKind === 'quota_balance';
          const [title, body] = isQuota
            ? errorKind === 'quota_rate_limited'
              ? [capability.quotaRateTitle, capability.quotaRateBody]
              : [capability.quotaBalanceTitle, capability.quotaBalanceBody]
            : [capability.unavailableTitle, capability.unavailableBody];
          Alert.alert(title, body, [
            {text: l10n.common.cancel, style: 'cancel'},
            {
              text: capability.retry,
              onPress: () => {
                handleSelectFiles().catch(() => undefined);
              },
            },
          ]);
          return;
        }
        if (fresh.capabilities.files === true) {
          await openFilePicker();
          return;
        }
        // Plan does not include Files: reasons.files (e.g.
        // paid_plan_required) explains the refusal server-side.
        Alert.alert(
          l10n.components.chatInput.fileUploadUnavailableTitle,
          l10n.components.chatInput.fileUploadUnavailableAccountBody,
        );
        return;
      }
      Alert.alert(
        l10n.components.chatInput.fileUploadUnavailableTitle,
        l10n.components.chatInput.fileUploadUnavailableBody,
      );
    };

    const handleRemoveFile = (uri: string) => {
      const target = selectedFiles.find(file => file.uri === uri);
      if (target) {
        cleanupTemporaryFile(target);
      }
      setSelectedFiles(current => current.filter(file => file.uri !== uri));
    };

    const fileStatusLabel = (file: BotConnectorFile) => {
      const status = l10n.components.chatInput;
      if (file.status === 'uploading') {
        return t(status.fileStatusUploading, {
          percent: String(Math.round(file.progress * 100)),
        });
      }
      if (file.status === 'ready') {
        return status.fileStatusReady;
      }
      if (file.status === 'failed') {
        return file.error || status.fileStatusFailed;
      }
      if (file.status === 'uploaded') {
        return status.fileStatusUploaded;
      }
      if (file.status === 'queued') {
        return status.fileStatusQueued;
      }
      if (file.status === 'waiting_parser') {
        return status.fileStatusWaitingParser;
      }
      if (file.status === 'ocr_required') {
        return status.fileStatusOcr;
      }
      if (file.status === 'waiting_retrieval') {
        return status.fileStatusWaitingRetrieval;
      }
      return status.fileStatusProcessing;
    };

    // Remove an image from the selection
    const handleRemoveImage = (index: number) => {
      const newImages = [...selectedImages];
      newImages.splice(index, 1);
      setSelectedImages(newImages);
    };

    const handleCancel = () => {
      setText('');
      onCancelEdit?.();
    };

    const hasSendableContent = value.trim().length > 0 || readyFiles.length > 0;
    const isSendButtonVisible =
      !isStreaming &&
      !isStopVisible &&
      user &&
      !isVideoCapable &&
      (sendButtonVisibilityMode === 'always' || hasSendableContent);
    const isSendButtonEnabled =
      hasActiveModel && hasSendableContent && !hasPendingFiles;
    const sendButtonOpacity = isSendButtonEnabled ? 1 : 0.4;

    const rotateInterpolate = iconRotation.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '180deg'],
    });

    const onSurfaceColor = currentActivePal?.color?.[0] || theme.colors.text;
    const onSurfaceColorVariant = onSurfaceColor + '55'; // for disabled state or placeholder text
    // Keep the attachment entry point visible. Availability is explained
    // inside the menu instead of making the entire control disappear.
    const isPlusButtonEnabled = !isStreaming;
    const plusColor = isPlusButtonEnabled
      ? onSurfaceColor
      : onSurfaceColorVariant;

    // Localize the current graded-effort tier through the same table the
    // model-settings chips use; fall back to the raw token for an unlisted one.
    const effortLevelLabels = l10n.components.modelSettingsSheet.effortLevels;
    const localizedEffort =
      reasoningEffort && reasoningEffort in effortLevelLabels
        ? effortLevelLabels[reasoningEffort as keyof typeof effortLevelLabels]
        : reasoningEffort;

    return (
      <View style={styles.container}>
        <View style={styles.inputContainer}>
          {/* Edit Bar (when in edit mode) */}
          {isEditMode && (
            <Animated.View
              style={[
                styles.editBar,
                {
                  height: editBarHeight,
                },
              ]}>
              <Text variant="labelSmall" style={styles.editBarText}>
                Editing message
              </Text>
              <IconButton
                hitSlop={8}
                icon="close"
                size={16}
                onPress={handleCancel}
                style={styles.editBarButton}
                iconColor={theme.colors.onSurfaceVariant}
              />
            </Animated.View>
          )}

          {selectedFiles.length > 0 && (
            <View style={styles.filePreviewContainer}>
              {selectedFiles.map(file => (
                <View key={file.uri} style={styles.filePreviewRow}>
                  <IconButton
                    hitSlop={8}
                    icon="file-document-outline"
                    size={20}
                    style={styles.filePreviewIcon}
                  />
                  <View style={styles.filePreviewText}>
                    <Text numberOfLines={1} style={styles.filePreviewName}>
                      {file.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.filePreviewStatus,
                        file.status === 'failed' && {
                          color: theme.colors.error,
                        },
                      ]}>
                      {fileStatusLabel(file)}
                    </Text>
                    {file.status === 'uploading' && (
                      <ProgressBar
                        progress={file.progress}
                        style={styles.fileProgress}
                      />
                    )}
                    {file.status !== 'uploading' &&
                      file.status !== 'ready' &&
                      file.status !== 'failed' && (
                        // Server-side parsing has no byte progress: show activity.
                        <ProgressBar
                          indeterminate
                          style={styles.fileProgress}
                        />
                      )}
                  </View>
                  {file.status === 'failed' && (
                    <IconButton
                      hitSlop={8}
                      icon="refresh"
                      size={18}
                      onPress={() =>
                        retrySelectedFile(file).catch(() => undefined)
                      }
                      accessibilityLabel={`Retry ${file.name}`}
                    />
                  )}
                  <IconButton
                    hitSlop={8}
                    icon="close"
                    size={18}
                    onPress={() => handleRemoveFile(file.uri)}
                    accessibilityLabel={`Remove ${file.name}`}
                  />
                </View>
              ))}
            </View>
          )}

          {/* Image Preview Section */}
          {selectedImages.length > 0 && (
            <View
              style={[
                styles.imagePreviewContainer,
                isEditMode && styles.imagePreviewContainerEditMode,
              ]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.imageScrollContent}>
                {selectedImages.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.imageContainer}>
                    <Image
                      source={{uri}}
                      style={styles.previewImage}
                      accessibilityLabel={`Image preview ${index + 1} of ${
                        selectedImages.length
                      }`}
                    />
                    <IconButton
                      hitSlop={8}
                      icon="close-circle"
                      size={20}
                      iconColor={theme.colors.error}
                      style={styles.removeImageButton}
                      onPress={() => handleRemoveImage(index)}
                      accessibilityLabel={`Remove image ${index + 1}`}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Text Input Area (Top Row) */}
          <View
            style={[
              styles.textInputArea,
              {
                paddingTop: isEditMode
                  ? selectedImages.length > 0
                    ? 8 // Reduced padding when images present in edit mode
                    : 48 // Edit bar height (28px) + normal padding (20px)
                  : selectedImages.length > 0
                    ? 0
                    : 20,
              },
            ]}>
            {/* Subtle Prompt Label for Video Pals */}
            {isVideoCapable && (
              <Text
                variant="labelSmall"
                style={[styles.promptLabel, {color: onSurfaceColorVariant}]}>
                {l10n.palsScreen.prompt}:
              </Text>
            )}
            <TextInput
              ref={inputRef}
              multiline
              placeholder={
                isVideoCapable
                  ? l10n.video.promptPlaceholder
                  : l10n.components.chatInput.inputPlaceholder
              }
              placeholderTextColor={onSurfaceColorVariant}
              underlineColorAndroid="transparent"
              {...textInputProps}
              style={[
                styles.input,
                textInputProps?.style,
                {
                  color: onSurfaceColor,
                },
                isVideoCapable && styles.inputWithLabel,
              ]}
              onChangeText={handleChangeText}
              value={value}
              editable={
                isVideoCapable
                  ? !isStreaming && !isCameraActive
                  : textInputProps?.editable !== false
              }
              testID="chat-input"
              accessibilityLabel="Message input"
            />
          </View>

          {/* Control Bar (Bottom Row) */}
          <View style={styles.controlBar}>
            {/* Left Controls */}
            <View style={styles.leftControls}>
              {/* Attachment entry point stays visible; each option explains
                  capability requirements instead of disappearing. */}
              {!isVideoCapable && (
                <Menu
                  visible={showImageUploadMenu}
                  onDismiss={() => setShowImageUploadMenu(false)}
                  anchorPosition="top"
                  anchor={
                    <TouchableOpacity
                      hitSlop={8}
                      style={styles.plusButton}
                      disabled={!isPlusButtonEnabled}
                      onPress={
                        isPlusButtonEnabled ? handlePlusButtonPress : () => {}
                      }
                      accessibilityLabel="Add attachment"
                      accessibilityRole="button">
                      <PlusIcon width={20} height={20} stroke={plusColor} />
                    </TouchableOpacity>
                  }>
                  {/* Camera/Gallery stay tappable: a non-vision model explains
                      why and offers the model picker instead of a dead row. */}
                  <Menu.Item
                    label={l10n.camera?.takePhoto || 'Camera'}
                    icon="camera"
                    labelStyle={!isVisionEnabled && styles.menuItemUnavailable}
                    accessibilityLabel={
                      isVisionEnabled
                        ? undefined
                        : `${l10n.camera?.takePhoto || 'Camera'} — ${visionMenuHint}`
                    }
                    onPress={requireVision(handleTakePhoto)}
                  />
                  <Menu.Item
                    label={l10n.common?.gallery || 'Gallery'}
                    icon="image"
                    labelStyle={!isVisionEnabled && styles.menuItemUnavailable}
                    accessibilityLabel={
                      isVisionEnabled
                        ? undefined
                        : `${l10n.common?.gallery || 'Gallery'} — ${visionMenuHint}`
                    }
                    onPress={requireVision(handleSelectImages)}
                  />
                  <Menu.Item
                    label={l10n.common?.file || 'File'}
                    icon="file-document-outline"
                    labelStyle={
                      !botConnectorFilesEnabled && styles.menuItemUnavailable
                    }
                    accessibilityLabel={
                      botConnectorFilesEnabled
                        ? undefined
                        : `${l10n.common?.file || 'File'} — ${l10n.components.chatInput.fileUploadUnavailableTitle}`
                    }
                    onPress={handleSelectFiles}
                  />
                </Menu>
              )}

              {/* Pal Selector */}
              <View style={styles.palSelector}>
                <TouchableOpacity
                  hitSlop={8}
                  style={[
                    styles.palBtn,
                    {
                      backgroundColor:
                        uiStore.colorScheme === 'dark'
                          ? theme.colors.inverseOnSurface
                          : theme.colors.inverseSurface,
                    },
                    currentActivePal?.color && {
                      backgroundColor: currentActivePal?.color?.[0],
                    },
                  ]}
                  onPress={onPalBtnPress}
                  accessibilityLabel="Select persona"
                  accessibilityRole="button">
                  <Animated.View
                    style={{
                      transform: [{rotate: rotateInterpolate}],
                    }}>
                    <ChevronUpIcon stroke={inputBackgroundColor} />
                  </Animated.View>
                </TouchableOpacity>

                {/* Pal Name Display */}
                {currentActivePal?.name && hasActiveModel && (
                  <>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.palNameCompact,
                        {
                          color: onSurfaceColor,
                        },
                      ]}>
                      Persona:{' '}
                      <Text
                        style={[
                          styles.palNameValueCompact,
                          {
                            color: onSurfaceColor,
                          },
                        ]}>
                        {currentActivePal?.name}
                      </Text>
                    </Text>
                    {/* Persona is optional: one tap turns it off. */}
                    <TouchableOpacity
                      hitSlop={15}
                      testID="clear-active-pal"
                      onPress={() => chatSessionStore.setActivePal(undefined)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        l10n.components.chatPalModelPickerSheet.disablePal
                      }>
                      <XSmIcon width={14} height={14} stroke={onSurfaceColor} />
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Explicit Internet mode. Keep the globe visible so capability
                  is discoverable; unavailable states explain themselves on tap. */}
              {showInternetToggle && !isCameraActive && (
                <TouchableOpacity
                  hitSlop={8}
                  testID="internet-toggle"
                  style={[
                    styles.internetToggle,
                    isInternetEnabled && {backgroundColor: onSurfaceColor},
                    {borderColor: onSurfaceColorVariant},
                    !isInternetAvailable && styles.internetToggleUnavailable,
                  ]}
                  onPress={() =>
                    isInternetAvailable
                      ? onInternetToggle?.(!isInternetEnabled)
                      : onInternetUnavailable?.()
                  }
                  accessibilityLabel={
                    isInternetEnabled
                      ? l10n.components.chatInput.internetToggle.disable
                      : l10n.components.chatInput.internetToggle.enable
                  }
                  accessibilityHint={
                    !isInternetAvailable
                      ? l10n.components.chatInput.internetToggle.unavailableHint
                      : undefined
                  }
                  accessibilityState={{selected: isInternetEnabled}}
                  accessibilityRole="button">
                  <GlobeIcon
                    width={17}
                    height={17}
                    stroke={
                      isInternetEnabled
                        ? inputBackgroundColor
                        : onSurfaceColorVariant
                    }
                  />
                </TouchableOpacity>
              )}

              {/* Thinking Toggle Button. Graded models (axis-2) cycle
                  off -> low -> medium -> high; effortless models toggle
                  on/off. The label shows the current effort when graded. */}
              {showThinkingToggle && !isCameraActive && (
                <TouchableOpacity
                  hitSlop={8}
                  testID="thinking-toggle"
                  style={[
                    styles.thinkingToggleLeft,
                    isThinkingEnabled && {backgroundColor: onSurfaceColor},
                    {borderColor: onSurfaceColorVariant},
                  ]}
                  onPress={() =>
                    supportsEffort && effortValues.length > 0
                      ? onEffortCycle?.()
                      : onThinkingToggle?.(!isThinkingEnabled)
                  }
                  accessibilityLabel={
                    supportsEffort && effortValues.length > 0
                      ? t(
                          l10n.components.chatInput.thinkingToggle.cycleEffort,
                          {
                            level: localizedEffort ?? '',
                          },
                        )
                      : isThinkingEnabled
                        ? l10n.components.chatInput.thinkingToggle
                            .disableThinking
                        : l10n.components.chatInput.thinkingToggle
                            .enableThinking
                  }
                  accessibilityRole="button">
                  <AtomIcon
                    width={14}
                    height={14}
                    stroke={
                      isThinkingEnabled
                        ? inputBackgroundColor
                        : onSurfaceColorVariant
                    }
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      styles.thinkingToggleText,
                      isThinkingEnabled
                        ? {color: inputBackgroundColor}
                        : {color: onSurfaceColorVariant},
                    ]}>
                    {supportsEffort && isThinkingEnabled && reasoningEffort
                      ? localizedEffort
                      : l10n.components.chatInput.thinkingToggle.thinkText}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Right Controls */}
            <View style={styles.rightControls}>
              {/* Helper text for model not loaded */}
              {showModelWarning && !hasActiveModel && (
                <View style={styles.helperTextContainer}>
                  <Text variant="bodySmall" style={styles.helperText}>
                    {l10n.chat.cannotSendWithoutModel}
                  </Text>
                </View>
              )}

              <IconButton
                hitSlop={8}
                testID="voice-input-button"
                icon={
                  isVoiceInputActive
                    ? 'microphone-settings'
                    : 'microphone-outline'
                }
                size={20}
                disabled={isVoiceInputActive || isStreaming || isCameraActive}
                iconColor={
                  isVoiceInputActive
                    ? theme.colors.primary
                    : theme.colors.onSurfaceVariant
                }
                onPress={() => handleVoiceInput().catch(() => undefined)}
                accessibilityLabel={
                  isVoiceInputActive
                    ? 'Listening for voice input'
                    : 'Voice input'
                }
              />

              {/* Voice chip (TTS) — always present so users can stop
                  audio independently of text generation. Self-gates:
                  returns null when TTS is unavailable. */}
              <VoiceChip />

              {/* Send/Stop Button */}
              {isStopVisible ? (
                <StopButton color={onSurfaceColor} onPress={onStopPress} />
              ) : isVideoCapable && !isCameraActive ? (
                /* Compact Start Video Button for Video Pals */
                <TouchableOpacity
                  hitSlop={8}
                  style={[
                    styles.compactVideoButton,
                    {
                      backgroundColor: onSurfaceColor,
                    },
                  ]}
                  onPress={onStartCamera}
                  accessibilityLabel="Start video analysis"
                  accessibilityRole="button">
                  <VideoRecorderIcon
                    width={16}
                    height={16}
                    stroke="white"
                    strokeWidth={2}
                  />
                  <Text style={styles.compactButtonText}>
                    {l10n.video.startCamera}
                  </Text>
                </TouchableOpacity>
              ) : (
                isSendButtonVisible && (
                  <View style={{opacity: sendButtonOpacity}}>
                    <SendButton color={onSurfaceColor} onPress={handleSend} />
                  </View>
                )
              )}
            </View>
          </View>
        </View>
      </View>
    );
  },
);
