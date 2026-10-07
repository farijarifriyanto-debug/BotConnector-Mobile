import React from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Share from 'react-native-share';
import {
  ActivityIndicator,
  Button,
  Icon,
  IconButton,
  Text,
} from 'react-native-paper';
import {observer} from 'mobx-react';
import {SafeAreaView} from 'react-native-safe-area-context';

import {
  BotConnectorMediaModel,
  fetchBotConnectorImageModels,
  generateBotConnectorImage,
} from '../../api/botconnectorMedia';
import {BotConnectorAccountCard, TextInput} from '../../components';
import {ModelArtwork} from '../../components/ModelArtwork';
import {Dropdown} from '../../components/ui';
import {isBotConnectorApiUrl} from '../../config/botconnector';
import {useTheme} from '../../hooks';
import {serverStore} from '../../store';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {createStyles} from './styles';

type ReferenceImage = {
  uri: string;
  dataUri: string;
  mimeType: string;
  bytes: number;
};

const MAX_REFERENCE_IMAGES = 4;
const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REFERENCE_TOTAL_BYTES = 8 * 1024 * 1024;
const REFERENCE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const extensionForMime = (mime: string): string => {
  if (mime.includes('jpeg') || mime.includes('jpg')) {
    return 'jpg';
  }
  if (mime.includes('webp')) {
    return 'webp';
  }
  return 'png';
};

export const ImageGenerationScreen = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = React.useContext(L10nContext);
  const copy = l10n.imageGeneration;

  const botConnectorServer = serverStore.servers.find(server =>
    isBotConnectorApiUrl(server.url),
  );

  const [apiKey, setApiKey] = React.useState('');
  const [models, setModels] = React.useState<BotConnectorMediaModel[]>([]);
  const [selectedModel, setSelectedModel] = React.useState('');
  const [prompt, setPrompt] = React.useState('');
  const [referenceImages, setReferenceImages] = React.useState<
    ReferenceImage[]
  >([]);
  const [loadingModels, setLoadingModels] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [resultUri, setResultUri] = React.useState<string | null>(null);
  const [resultMime, setResultMime] = React.useState('image/png');
  const [resultAccess, setResultAccess] = React.useState<string | undefined>();
  const [quotaText, setQuotaText] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const contentRef = React.useRef<ScrollView>(null);
  const promptYRef = React.useRef(0);
  const handlePromptFocus = React.useCallback(() => {
    // Wait for the iOS keyboard animation, then place the prompt near the top
    // of the visible viewport. Do not scrollToEnd: an old generated image may
    // live below the composer and would otherwise pull focus away from input.
    setTimeout(
      () =>
        contentRef.current?.scrollTo({
          y: Math.max(0, promptYRef.current - 12),
          animated: true,
        }),
      180,
    );
  }, []);

  const formatAccess = (access?: string): string => {
    if (!access) {
      return '';
    }
    const known = copy.access[access as keyof typeof copy.access];
    return known ?? access.toUpperCase();
  };

  const loadModels = React.useCallback(async () => {
    if (!botConnectorServer) {
      setApiKey('');
      setModels([]);
      setSelectedModel('');
      return;
    }

    setLoadingModels(true);
    setError(null);
    try {
      const key = (await serverStore.getApiKey(botConnectorServer.id)) || '';
      setApiKey(key);
      if (!key) {
        setModels([]);
        setSelectedModel('');
        return;
      }

      const list = await fetchBotConnectorImageModels({
        serverUrl: botConnectorServer.url,
        apiKey: key,
      });
      const sorted = [...list].sort((a, b) => {
        const rank: Record<string, number> = {free: 0, plan: 1, payg: 2};
        const byAccess =
          (rank[a.botconnector_access] ?? 9) -
          (rank[b.botconnector_access] ?? 9);
        return byAccess || a.name.localeCompare(b.name);
      });
      setModels(sorted);
      setSelectedModel(current =>
        sorted.some(model => model.id === current)
          ? current
          : (sorted[0]?.id ?? ''),
      );
    } catch (e) {
      setModels([]);
      setSelectedModel('');
      setError(e instanceof Error ? e.message : copy.errorLoadModels);
    } finally {
      setLoadingModels(false);
    }
  }, [botConnectorServer, copy.errorLoadModels]);

  React.useEffect(() => {
    loadModels().catch(() => undefined);
  }, [loadModels]);

  const selected = models.find(model => model.id === selectedModel);
  const supportsReferenceImages = selected?.supports_reference_images === true;
  const selectedMeta = selected
    ? [selected.developer, formatAccess(selected.botconnector_access)]
        .filter(Boolean)
        .join(' · ')
    : '';

  React.useEffect(() => {
    if (!supportsReferenceImages && referenceImages.length > 0) {
      setReferenceImages([]);
    }
  }, [supportsReferenceImages, referenceImages.length]);

  const addReferenceImages = async () => {
    if (!supportsReferenceImages) {
      return;
    }
    try {
      const remaining = MAX_REFERENCE_IMAGES - referenceImages.length;
      if (remaining <= 0) {
        return;
      }
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: remaining,
        includeBase64: true,
        quality: 0.9,
      });
      if (!result.assets?.length) {
        return;
      }

      const existingBytes = referenceImages.reduce(
        (sum, item) => sum + item.bytes,
        0,
      );
      let runningBytes = existingBytes;
      const accepted: ReferenceImage[] = [];
      for (const asset of result.assets) {
        const mimeType = String(asset.type || '').toLowerCase();
        const bytes = Number(asset.fileSize || 0);
        if (
          !asset.uri ||
          !asset.base64 ||
          !REFERENCE_MIME_TYPES.has(mimeType)
        ) {
          continue;
        }
        if (bytes <= 0 || bytes > MAX_REFERENCE_IMAGE_BYTES) {
          continue;
        }
        if (runningBytes + bytes > MAX_REFERENCE_TOTAL_BYTES) {
          break;
        }
        runningBytes += bytes;
        accepted.push({
          uri: asset.uri,
          dataUri: `data:${mimeType};base64,${asset.base64}`,
          mimeType,
          bytes,
        });
      }
      if (accepted.length === 0) {
        Alert.alert('BotConnector', copy.referenceHint);
        return;
      }
      setReferenceImages(current =>
        [...current, ...accepted].slice(0, MAX_REFERENCE_IMAGES),
      );
    } catch (e) {
      Alert.alert(
        'BotConnector',
        e instanceof Error ? e.message : copy.referenceHint,
      );
    }
  };

  const generate = async () => {
    if (!botConnectorServer || !apiKey || !selectedModel || !prompt.trim()) {
      return;
    }

    setGenerating(true);
    setError(null);
    setQuotaText(null);
    try {
      const result = await generateBotConnectorImage({
        serverUrl: botConnectorServer.url,
        apiKey,
        model: selectedModel,
        prompt: prompt.trim(),
        referenceImages: referenceImages.map(image => image.dataUri),
      });

      if (resultUri?.startsWith('file://')) {
        RNFS.unlink(resultUri.slice('file://'.length)).catch(() => undefined);
      }

      const extension = extensionForMime(result.mimeType);
      const path = `${RNFS.CachesDirectoryPath}/botconnector-image-${Date.now()}.${extension}`;
      await RNFS.writeFile(path, result.b64, 'base64');
      setResultUri(`file://${path}`);
      setResultMime(result.mimeType);
      setResultAccess(result.access);

      if (
        typeof result.quotaRemaining === 'number' &&
        typeof result.quotaLimit === 'number'
      ) {
        setQuotaText(
          t(copy.quotaRemaining, {
            remaining: result.quotaRemaining,
            limit: result.quotaLimit,
          }),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.errorGenerate);
    } finally {
      setGenerating(false);
    }
  };

  const shareResult = async () => {
    if (!resultUri) {
      return;
    }
    try {
      await Share.open({
        url: resultUri,
        type: resultMime,
        failOnCancel: false,
      });
    } catch (e) {
      Alert.alert(
        'BotConnector',
        e instanceof Error ? e.message : copy.errorShare,
      );
    }
  };

  if (!botConnectorServer || !apiKey) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.connectContainer}>
          <BotConnectorAccountCard />
          <View style={styles.centerState}>
            <Text variant="titleMedium">{copy.connectTitle}</Text>
            <Text style={styles.muted}>{copy.connectBody}</Text>
            <Button mode="outlined" onPress={() => loadModels()}>
              {copy.retry}
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={contentRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === 'ios' ? 'interactive' : 'on-drag'
          }>
          {/* Compact account + plan status (quota is enforced server-side). */}
          <BotConnectorAccountCard compact />

          {/* Model selector: artwork + compact dropdown, one meta line. */}
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text variant="titleSmall">{copy.model}</Text>
              {selectedMeta ? (
                <Text style={styles.metaText} numberOfLines={1}>
                  {selectedMeta}
                </Text>
              ) : null}
            </View>
            {loadingModels ? (
              <View style={styles.stateRow} testID="image-models-loading">
                <ActivityIndicator size="small" />
                <Text style={styles.muted}>{copy.modelLoading}</Text>
              </View>
            ) : models.length > 0 ? (
              <View style={styles.modelRow}>
                <ModelArtwork
                  metadata={{
                    provider: selected?.developer,
                    name: selected?.name,
                    modelId: selected?.id,
                  }}
                  size={20}
                  color={theme.colors.onSurfaceVariant}
                />
                <Dropdown
                  testID="image-model-dropdown"
                  value={selectedModel}
                  options={models.map(model => ({
                    value: model.id,
                    label: model.name,
                  }))}
                  onChange={setSelectedModel}
                  accessibilityLabel={copy.model}
                  style={styles.modelDropdown}
                />
              </View>
            ) : (
              <View style={styles.emptyModels}>
                <Text style={styles.muted}>{copy.modelEmpty}</Text>
                <Button mode="text" compact onPress={() => loadModels()}>
                  {copy.retry}
                </Button>
              </View>
            )}
          </View>

          {/* Prompt */}
          <View
            style={styles.field}
            onLayout={event => {
              promptYRef.current = event.nativeEvent.layout.y;
            }}>
            <Text variant="titleSmall">{copy.prompt}</Text>
            <TextInput
              testID="image-prompt-input"
              value={prompt}
              onChangeText={setPrompt}
              onFocus={handlePromptFocus}
              placeholder={copy.promptPlaceholder}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Reference photo flow */}
          <View style={styles.referenceSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleCluster}>
                <Text variant="titleSmall">{copy.reference}</Text>
                {referenceImages.length > 0 ? (
                  <Text style={styles.countText}>
                    {t(copy.referenceCount, {
                      current: referenceImages.length,
                      max: MAX_REFERENCE_IMAGES,
                    })}
                  </Text>
                ) : null}
              </View>
              <Button
                compact
                mode="text"
                icon="image-plus"
                disabled={
                  !supportsReferenceImages ||
                  referenceImages.length >= MAX_REFERENCE_IMAGES
                }
                accessibilityHint={
                  supportsReferenceImages
                    ? referenceImages.length >= MAX_REFERENCE_IMAGES
                      ? copy.referenceHint
                      : undefined
                    : copy.referenceUnsupported
                }
                onPress={() => addReferenceImages().catch(() => undefined)}>
                {copy.addReference}
              </Button>
            </View>
            <Text style={styles.referenceHint} numberOfLines={2}>
              {supportsReferenceImages
                ? copy.referenceHint
                : copy.referenceUnsupported}
            </Text>
            {referenceImages.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.referenceList}>
                {referenceImages.map((image, index) => (
                  <View
                    key={`${image.uri}:${index}`}
                    style={styles.referenceItem}>
                    <Image
                      source={{uri: image.uri}}
                      style={styles.referenceImage}
                    />
                    <IconButton
                      icon="close-circle"
                      size={20}
                      style={styles.referenceRemove}
                      hitSlop={10}
                      accessibilityLabel={copy.removeReference}
                      onPress={() =>
                        setReferenceImages(current =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    />
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>

          {/* Primary action */}
          <Button
            mode="contained"
            testID="generate-image-button"
            loading={generating}
            disabled={generating || !selectedModel || !prompt.trim()}
            accessibilityHint={
              generating || (selectedModel && prompt.trim())
                ? undefined
                : copy.generateDisabledHint
            }
            onPress={() => generate().catch(() => undefined)}>
            {generating ? copy.generating : copy.generate}
          </Button>

          {/* Error state */}
          {error ? (
            <View style={styles.errorBanner} testID="image-error">
              <Icon
                source="alert-circle-outline"
                size={18}
                color={theme.colors.onErrorContainer}
              />
              <Text style={styles.errorText} accessibilityRole="alert">
                {error}
              </Text>
            </View>
          ) : null}

          {/* Result state */}
          {resultUri ? (
            <View style={styles.resultCard}>
              <Image
                testID="generated-image"
                source={{uri: resultUri}}
                resizeMode="contain"
                style={styles.resultImage}
              />
              <View style={styles.resultFooter}>
                <View style={styles.resultMeta}>
                  <Text variant="labelMedium" numberOfLines={1}>
                    {copy.generated}
                    {resultAccess ? ` · ${formatAccess(resultAccess)}` : ''}
                  </Text>
                  {quotaText ? (
                    <Text style={styles.muted} numberOfLines={1}>
                      {quotaText}
                    </Text>
                  ) : null}
                </View>
                <IconButton
                  testID="share-generated-image"
                  icon="share-variant"
                  size={20}
                  hitSlop={10}
                  accessibilityLabel={copy.share}
                  onPress={shareResult}
                />
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
});
