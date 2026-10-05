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
} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';
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
} from '../../assets/icons';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {
  chatSessionStore,
  modelStore,
  palStore,
  serverStore,
  uiStore,
} from '../../store';

import {MessageType} from '../../utils/types';
import {L10nContext, UserContext} from '../../utils';
import {t} from '../../locales';
import {isBotConnectorApiUrl} from '../../config/botconnector';
import {
  BOTCONNECTOR_FILE_MAX_COUNT,
  BOTCONNECTOR_FILE_MAX_TOTAL_BYTES,
  BotConnectorFile,
  getBotConnectorFile,
  isBotConnectorFileReady,
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
    showImageUpload = false,
    isVisionEnabled = false,
    defaultImages,
    onDefaultImagesChange,
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
    const botConnectorFilesEnabled = Boolean(
      activeServer &&
        isBotConnectorApiUrl(activeServer.url) &&
        serverStore.botConnectorAccess[activeServer.id]?.access === 'full',
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
    // State for image upload menu
    const [showImageUploadMenu, setShowImageUploadMenu] = React.useState(false);
    // State for showing "model not loaded" helper text
    const [showModelWarning, setShowModelWarning] = React.useState(false);
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

    const readyFiles = botConnectorFilesEnabled
      ? selectedFiles.filter(isBotConnectorFileReady)
      : [];
    const hasPendingFiles =
      botConnectorFilesEnabled &&
      selectedFiles.some(
        file =>
          file.status !== 'ready' &&
          file.status !== 'failed',
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

    const pollFileStatus = async (
      localKey: string,
      serverUrl: string,
      apiKey: string,
      fileId: string,
    ) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        try {
          const latest = await getBotConnectorFile({
            serverUrl,
            apiKey,
            fileId,
          });
          updateSelectedFile(localKey, {
            id: latest.id,
            name: latest.filename,
            size: latest.bytes,
            mediaType: latest.media_type || 'application/octet-stream',
            status: latest.status,
            route: latest.route,
            parser: latest.parser,
            progress: 1,
          });
          if (latest.status === 'ready') {
            return;
          }
        } catch (error) {
          updateSelectedFile(localKey, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'File processing failed',
          });
          return;
        }
      }
      updateSelectedFile(localKey, {
        status: 'failed',
        error: 'Processing is taking longer than expected. Tap retry.',
      });
    };

    const retrySelectedFile = async (file: BotConnectorFile) => {
      if (!activeServer || !botConnectorFilesEnabled) {
        return;
      }
      const apiKey = await serverStore.getApiKey(activeServer.id);
      if (!apiKey) {
        updateSelectedFile(file.uri, {
          status: 'failed',
          error: 'BotConnector API key is required',
        });
        return;
      }
      if (file.id) {
        updateSelectedFile(file.uri, {
          status: 'processing',
          error: undefined,
        });
        void pollFileStatus(
          file.uri,
          activeServer.url,
          apiKey,
          file.id,
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
          onProgress: progress =>
            updateSelectedFile(file.uri, {progress}),
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
          void pollFileStatus(
            file.uri,
            activeServer.url,
            apiKey,
            uploaded.id,
          );
        }
      } catch (error) {
        updateSelectedFile(file.uri, {
          status: 'failed',
          error:
            error instanceof Error
              ? error.message
              : 'File upload failed',
        });
      }
    };

    const handleSelectFiles = async () => {
      if (!activeServer || !botConnectorFilesEnabled) {
        return;
      }
      try {
        const picked = await pick({
          type: [types.allFiles],
          allowMultiSelection: true,
        });
        const remaining = Math.max(
          0,
          BOTCONNECTOR_FILE_MAX_COUNT - selectedFiles.length,
        );
        const candidates = picked.slice(0, remaining);
        const existingBytes = selectedFiles.reduce(
          (sum, file) => sum + file.size,
          0,
        );
        let acceptedBytes = existingBytes;
        const accepted: BotConnectorFile[] = [];
        for (const item of candidates) {
          const size = Number(item.size || 0);
          if (
            size > BOTCONNECTOR_FILE_MAX_TOTAL_BYTES ||
            acceptedBytes + size > BOTCONNECTOR_FILE_MAX_TOTAL_BYTES
          ) {
            Alert.alert(
              'File too large',
              'Maximum total attachment size is 512 MB per message.',
            );
            continue;
          }
          acceptedBytes += size;
          accepted.push({
            uri: item.uri,
            name: item.name || 'file',
            size,
            mediaType: item.type || 'application/octet-stream',
            status: 'uploading',
            progress: 0,
          });
        }
        if (accepted.length === 0) {
          setShowImageUploadMenu(false);
          return;
        }
        setSelectedFiles(current => [...current, ...accepted]);
        setShowImageUploadMenu(false);

        const apiKey = await serverStore.getApiKey(activeServer.id);
        if (!apiKey) {
          throw new Error('BotConnector API key is required');
        }

        // Upload sequentially to avoid multiplying 512 MB transfers on mobile.
        // Processing polling is detached so the next file can start uploading.
        for (const file of accepted) {
          try {
            const uploaded = await uploadBotConnectorFile({
              serverUrl: activeServer.url,
              apiKey,
              file,
              onProgress: progress =>
                updateSelectedFile(file.uri, {progress}),
            });
            updateSelectedFile(file.uri, {
              id: uploaded.id,
              name: uploaded.filename,
              size: uploaded.bytes,
              mediaType:
                uploaded.media_type || file.mediaType,
              status: uploaded.status,
              route: uploaded.route,
              parser: uploaded.parser,
              progress: 1,
            });
            if (uploaded.status !== 'ready') {
              void pollFileStatus(
                file.uri,
                activeServer.url,
                apiKey,
                uploaded.id,
              );
            }
          } catch (error) {
            updateSelectedFile(file.uri, {
              status: 'failed',
              error:
                error instanceof Error
                  ? error.message
                  : 'File upload failed',
            });
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
          'File upload failed',
          error instanceof Error ? error.message : 'Unable to upload file.',
        );
      }
    };

    const handleRemoveFile = (uri: string) => {
      setSelectedFiles(current => current.filter(file => file.uri !== uri));
    };

    const fileStatusLabel = (file: BotConnectorFile) => {
      if (file.status === 'uploading') {
        return `Uploading ${Math.round(file.progress * 100)}%`;
      }
      if (file.status === 'ready') {
        return 'Ready';
      }
      if (file.status === 'failed') {
        return file.error || 'Upload failed';
      }
      return 'Processing…';
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

    const hasSendableContent =
      value.trim().length > 0 || readyFiles.length > 0;
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
    // // Plus button state
    const isPlusButtonEnabled =
      !isStreaming && (isVisionEnabled || botConnectorFilesEnabled);
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
                    icon="file-document-outline"
                    size={20}
                    style={styles.filePreviewIcon}
                  />
                  <View style={styles.filePreviewText}>
                    <Text
                      numberOfLines={1}
                      style={styles.filePreviewName}>
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
                  </View>
                  {file.status === 'failed' && (
                    <IconButton
                      icon="refresh"
                      size={18}
                      onPress={() => void retrySelectedFile(file)}
                      accessibilityLabel={`Retry ${file.name}`}
                    />
                  )}
                  <IconButton
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
              {/* Plus Button for Image Upload (only for regular chat) */}
              {showImageUpload && !isVideoCapable && (
                <Menu
                  visible={showImageUploadMenu}
                  onDismiss={() => setShowImageUploadMenu(false)}
                  anchorPosition="top"
                  anchor={
                    <TouchableOpacity
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
                  <Menu.Item
                    label={l10n.camera?.takePhoto || 'Camera'}
                    icon="camera"
                    disabled={!isVisionEnabled}
                    onPress={handleTakePhoto}
                  />
                  <Menu.Item
                    label={l10n.common?.gallery || 'Gallery'}
                    icon="image"
                    disabled={!isVisionEnabled}
                    onPress={handleSelectImages}
                  />
                  {botConnectorFilesEnabled && (
                    <Menu.Item
                      label="File"
                      icon="file-document-outline"
                      onPress={handleSelectFiles}
                    />
                  )}
                </Menu>
              )}

              {/* Pal Selector */}
              <View style={styles.palSelector}>
                <TouchableOpacity
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
                  accessibilityLabel="Select Pal"
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
                  <Text
                    style={[
                      styles.palNameCompact,
                      {
                        color: onSurfaceColor,
                      },
                    ]}>
                    Pal:{' '}
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
                )}
              </View>

              {/* Thinking Toggle Button. Graded models (axis-2) cycle
                  off -> low -> medium -> high; effortless models toggle
                  on/off. The label shows the current effort when graded. */}
              {showThinkingToggle && !isCameraActive && (
                <TouchableOpacity
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
