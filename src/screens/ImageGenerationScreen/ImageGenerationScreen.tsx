import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import ImageViewing from 'react-native-image-viewing';
import Share from 'react-native-share';
import {Button, Chip, Icon, IconButton, Text} from 'react-native-paper';
import {observer} from 'mobx-react';
import {SafeAreaView} from 'react-native-safe-area-context';

import {
  BotConnectorImageError,
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
import type {Translations} from '../../locales/types';
import {
  ImageHistoryEntry,
  listImageHistory,
  readHistoryImageAsDataUri,
  removeImageHistoryEntry,
  saveGeneratedImage,
  toggleImageHistoryFavorite,
} from '../../utils/imageGenerationHistory';
import {
  ALL_IMAGE_SIZES,
  IMAGE_SIZE_FOR_RATIO,
  ImageSizeRatio,
  ratioAvailable,
  resolveAllowedImageSizes,
  sizeForRatio,
} from '../../utils/imageGenerationSize';
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

const RATIOS: readonly ImageSizeRatio[] = ['square', 'landscape', 'portrait'];
const EXAMPLE_KEYS = ['product', 'scenic', 'mascot', 'logo', 'anime'] as const;
const PROMPT_WARN_LENGTH = 2000;
const LAST_QUOTA_STORAGE_KEY = 'botconnector.imageLastQuota.v1';

type ImageCopy = Translations['imageGeneration'];

/**
 * Every failure is rendered from a local (i18n) string: the raw server
 * message is never shown. Returns '' for cancellations (silent).
 */
function imageErrorMessage(
  e: unknown,
  copy: ImageCopy,
  fallback: string,
): string {
  if (e instanceof BotConnectorImageError) {
    switch (e.kind) {
      case 'quota_exhausted':
        return copy.errors.quotaExhausted;
      case 'plan_required':
        return copy.errors.planRequired;
      case 'balance_required':
        return copy.errors.balance;
      case 'rate_limited':
        return typeof e.retryAfterSeconds === 'number'
          ? t(copy.errors.rateLimited, {seconds: e.retryAfterSeconds})
          : copy.errors.rateLimitedNow;
      case 'unauthorized':
        return copy.errors.unauthorized;
      case 'timeout':
        return copy.errors.timeout;
      case 'aborted':
        return '';
      default:
        return fallback;
    }
  }
  return fallback;
}

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
  const [ratio, setRatio] = React.useState<ImageSizeRatio>('square');
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
  const [history, setHistory] = React.useState<ImageHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = React.useState<
    string | null
  >(null);
  const [viewerVisible, setViewerVisible] = React.useState(false);
  const [lastQuota, setLastQuota] = React.useState<{
    tier?: string;
    remaining?: number;
    limit?: number;
    period?: string;
  } | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
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
      setError(
        imageErrorMessage(e, copy, copy.errorLoadModels) ||
          copy.errorLoadModels,
      );
    } finally {
      setLoadingModels(false);
    }
  }, [botConnectorServer, copy]);

  React.useEffect(() => {
    loadModels().catch(() => undefined);
  }, [loadModels]);

  React.useEffect(() => {
    listImageHistory()
      .then(setHistory)
      .catch(() => undefined);
    AsyncStorage.getItem(LAST_QUOTA_STORAGE_KEY)
      .then(stored => {
        if (!stored) {
          return;
        }
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setLastQuota(parsed);
        }
      })
      .catch(() => undefined);
  }, []);

  const selected = models.find(model => model.id === selectedModel);
  const supportsReferenceImages = selected?.supports_reference_images === true;
  const allowedSizes = React.useMemo(
    () => (selected ? resolveAllowedImageSizes(selected) : ALL_IMAGE_SIZES),
    [selected],
  );
  const activeRatio: ImageSizeRatio = ratioAvailable(ratio, allowedSizes)
    ? ratio
    : (RATIOS.find(candidate => ratioAvailable(candidate, allowedSizes)) ??
      'square');
  const selectedSize = sizeForRatio(activeRatio, allowedSizes);
  const selectedMeta = selected?.developer ?? '';

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

    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError(null);
    setQuotaText(null);
    try {
      const result = await generateBotConnectorImage({
        serverUrl: botConnectorServer.url,
        apiKey,
        model: selectedModel,
        prompt: prompt.trim(),
        size: selectedSize,
        referenceImages: referenceImages.map(image => image.dataUri),
        signal: controller.signal,
      });

      const entry = await saveGeneratedImage({
        b64: result.b64,
        mimeType: result.mimeType,
        prompt: prompt.trim(),
        modelId: selectedModel,
        modelName: selected?.name,
        size: selectedSize,
      });
      setResultUri(entry.fileUri);
      setResultMime(result.mimeType);
      setResultAccess(result.access);
      setHistory(await listImageHistory());

      if (result.quota) {
        setLastQuota(result.quota);
        AsyncStorage.setItem(
          LAST_QUOTA_STORAGE_KEY,
          JSON.stringify(result.quota),
        ).catch(() => undefined);
        if (
          typeof result.quota.remaining === 'number' &&
          typeof result.quota.limit === 'number'
        ) {
          setQuotaText(
            t(copy.quotaRemaining, {
              remaining: result.quota.remaining,
              limit: result.quota.limit,
            }),
          );
        }
      }
    } catch (e) {
      const message = imageErrorMessage(e, copy, copy.errorGenerate);
      setError(message || null);
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  };

  const cancelGenerate = () => {
    abortRef.current?.abort();
  };

  const applyExample = (text: string) => {
    setPrompt(current =>
      current.trim() ? `${current.trim()}, ${text}` : text,
    );
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

  const saveResultToGallery = async () => {
    if (!resultUri) {
      return;
    }
    try {
      // Ask for the gallery permission only when the user actually saves.
      if (Platform.OS === 'android' && Number(Platform.Version) < 29) {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('BotConnector', copy.save.error);
          return;
        }
      }
      await CameraRoll.save(resultUri, {type: 'photo'});
      Alert.alert('BotConnector', copy.save.done);
    } catch {
      Alert.alert('BotConnector', copy.save.error);
    }
  };

  const selectedHistory =
    history.find(entry => entry.id === selectedHistoryId) ?? null;

  const toggleFavorite = async (id: string) => {
    try {
      setHistory(await toggleImageHistoryFavorite(id));
    } catch {
      // Best effort: the list simply stays as it was.
    }
  };

  const deleteHistoryEntry = async (entry: ImageHistoryEntry) => {
    try {
      const next = await removeImageHistoryEntry(entry.id);
      setHistory(next);
      setSelectedHistoryId(null);
      if (resultUri === entry.fileUri) {
        setResultUri(null);
      }
    } catch {
      // Best effort: deletion failure leaves the entry in place.
    }
  };

  const regenerateFromHistory = (entry: ImageHistoryEntry) => {
    setPrompt(entry.prompt);
    if (models.some(model => model.id === entry.modelId)) {
      setSelectedModel(entry.modelId);
    }
    const matchedRatio = RATIOS.find(
      candidate => IMAGE_SIZE_FOR_RATIO[candidate] === entry.size,
    );
    if (matchedRatio) {
      setRatio(matchedRatio);
    }
    setSelectedHistoryId(null);
  };

  const useHistoryAsReference = async (entry: ImageHistoryEntry) => {
    if (
      !supportsReferenceImages ||
      referenceImages.length >= MAX_REFERENCE_IMAGES
    ) {
      return;
    }
    try {
      const dataUri = await readHistoryImageAsDataUri(entry);
      const commaIndex = dataUri.indexOf(',');
      const bytes = Math.floor(((dataUri.length - commaIndex - 1) * 3) / 4);
      const existingBytes = referenceImages.reduce(
        (sum, item) => sum + item.bytes,
        0,
      );
      if (
        !REFERENCE_MIME_TYPES.has(entry.mimeType) ||
        bytes > MAX_REFERENCE_IMAGE_BYTES ||
        existingBytes + bytes > MAX_REFERENCE_TOTAL_BYTES
      ) {
        Alert.alert('BotConnector', copy.referenceHint);
        return;
      }
      setReferenceImages(current =>
        [
          ...current,
          {uri: entry.fileUri, dataUri, mimeType: entry.mimeType, bytes},
        ].slice(0, MAX_REFERENCE_IMAGES),
      );
      setSelectedHistoryId(null);
    } catch {
      Alert.alert('BotConnector', copy.referenceHint);
    }
  };

  const quotaLine = React.useMemo(() => {
    if (
      !lastQuota ||
      typeof lastQuota.remaining !== 'number' ||
      typeof lastQuota.limit !== 'number'
    ) {
      return null;
    }
    const periods = copy.quota.periods as Record<string, string>;
    const period = lastQuota.period
      ? (periods[lastQuota.period] ?? lastQuota.period)
      : '';
    let line = t(copy.quota.line, {
      remaining: lastQuota.remaining,
      limit: lastQuota.limit,
      period,
    });
    if (lastQuota.tier) {
      line += ` · ${t(copy.quota.tier, {tier: lastQuota.tier})}`;
    }
    return line;
  }, [lastQuota, copy.quota]);

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

          {/* Last known image quota (from botconnector.image_quota). */}
          {quotaLine ? (
            <Text testID="image-quota-line" style={styles.muted}>
              {quotaLine}
            </Text>
          ) : null}

          {/* Model selector: artwork + compact dropdown, one meta line. */}
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text variant="titleSmall">{copy.model}</Text>
              <View style={styles.metaCluster}>
                {selected ? (
                  <Chip
                    compact
                    mode="flat"
                    style={styles.accessBadge}
                    testID="image-access-badge"
                    accessibilityLabel={formatAccess(
                      selected.botconnector_access,
                    )}>
                    {formatAccess(selected.botconnector_access)}
                  </Chip>
                ) : null}
                {selectedMeta ? (
                  <Text style={styles.metaText} numberOfLines={1}>
                    {selectedMeta}
                  </Text>
                ) : null}
              </View>
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

          {/* Aspect ratio / size (narrowed per model). */}
          <View style={styles.field}>
            <Text variant="titleSmall">{copy.size.label}</Text>
            <View style={styles.sizeRow}>
              {RATIOS.map(candidate => {
                const available = ratioAvailable(candidate, allowedSizes);
                const selectedChip = activeRatio === candidate;
                return (
                  <Chip
                    key={candidate}
                    mode={selectedChip ? 'flat' : 'outlined'}
                    selected={selectedChip}
                    disabled={!available}
                    style={styles.controlChip}
                    testID={`size-ratio-${candidate}`}
                    accessibilityLabel={copy.size[candidate]}
                    onPress={() => setRatio(candidate)}>
                    {copy.size[candidate]}
                  </Chip>
                );
              })}
            </View>
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
            {prompt.length > 0 ? (
              <Text
                testID="image-prompt-count"
                style={[
                  styles.promptCount,
                  prompt.length > PROMPT_WARN_LENGTH && styles.promptCountWarn,
                ]}>
                {t(copy.promptCount, {count: prompt.length})}
              </Text>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.exampleList}
              testID="image-examples">
              {EXAMPLE_KEYS.map((key, index) => (
                <Chip
                  key={key}
                  mode="outlined"
                  compact
                  style={styles.controlChip}
                  testID={`image-example-${index}`}
                  accessibilityLabel={copy.examples[key]}
                  onPress={() => applyExample(copy.examples[key])}>
                  {copy.examples[key]}
                </Chip>
              ))}
            </ScrollView>
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

          {/* Primary action: becomes Cancel while a generation runs; the
              screen keeps scrolling and stays interactive (no lock). */}
          {generating ? (
            <View style={styles.field}>
              <View style={styles.stateRow} testID="image-generating-progress">
                <ActivityIndicator size="small" />
                <Text style={styles.muted}>{copy.generating}</Text>
              </View>
              <Button
                mode="outlined"
                icon="close"
                testID="cancel-generate-button"
                style={styles.actionButton}
                accessibilityLabel={copy.cancel}
                onPress={cancelGenerate}>
                {copy.cancel}
              </Button>
            </View>
          ) : (
            <Button
              mode="contained"
              testID="generate-image-button"
              style={styles.actionButton}
              disabled={!selectedModel || !prompt.trim()}
              accessibilityHint={
                selectedModel && prompt.trim()
                  ? undefined
                  : copy.generateDisabledHint
              }
              onPress={() => generate().catch(() => undefined)}>
              {copy.generate}
            </Button>
          )}

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
                <View style={styles.resultActions}>
                  <IconButton
                    testID="save-generated-image"
                    icon="download"
                    size={20}
                    hitSlop={10}
                    accessibilityLabel={copy.save.action}
                    onPress={() => saveResultToGallery()}
                  />
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
            </View>
          ) : null}

          {/* Local history: favorites, reopen, reuse, delete. */}
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text variant="titleSmall">{copy.history.title}</Text>
              {history.length === 0 ? (
                <Text style={styles.muted}>{copy.history.empty}</Text>
              ) : null}
            </View>
            {history.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.historyList}
                testID="image-history-list">
                {history.map((entry, index) => (
                  <Pressable
                    key={entry.id}
                    testID={`history-thumb-${entry.id}`}
                    onPress={() =>
                      setSelectedHistoryId(current =>
                        current === entry.id ? null : entry.id,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t(copy.history.thumbLabel, {
                      n: index + 1,
                    })}
                    accessibilityState={{
                      selected: selectedHistoryId === entry.id,
                    }}
                    style={[
                      styles.historyThumbWrap,
                      selectedHistoryId === entry.id &&
                        styles.historyThumbSelected,
                    ]}>
                    <Image
                      source={{uri: entry.fileUri}}
                      style={styles.historyThumb}
                    />
                    {entry.favorite ? (
                      <View style={styles.historyStar}>
                        <Icon
                          source="star"
                          size={14}
                          color={theme.colors.primary}
                        />
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {selectedHistory ? (
              <View style={styles.historyActions} testID="history-actions">
                <Button
                  compact
                  icon="eye"
                  style={styles.actionButton}
                  accessibilityLabel={copy.history.open}
                  onPress={() => setViewerVisible(true)}>
                  {copy.history.open}
                </Button>
                <Button
                  compact
                  icon={selectedHistory.favorite ? 'star-off' : 'star'}
                  style={styles.actionButton}
                  accessibilityLabel={
                    selectedHistory.favorite
                      ? copy.history.unfavorite
                      : copy.history.favorite
                  }
                  onPress={() => toggleFavorite(selectedHistory.id)}>
                  {selectedHistory.favorite
                    ? copy.history.unfavorite
                    : copy.history.favorite}
                </Button>
                <Button
                  compact
                  icon="delete-outline"
                  style={styles.actionButton}
                  accessibilityLabel={copy.history.delete}
                  onPress={() => deleteHistoryEntry(selectedHistory)}>
                  {copy.history.delete}
                </Button>
                <Button
                  compact
                  icon="refresh"
                  style={styles.actionButton}
                  accessibilityLabel={copy.history.regenerate}
                  onPress={() => regenerateFromHistory(selectedHistory)}>
                  {copy.history.regenerate}
                </Button>
                <Button
                  compact
                  icon="image-plus"
                  style={styles.actionButton}
                  disabled={
                    !supportsReferenceImages ||
                    referenceImages.length >= MAX_REFERENCE_IMAGES
                  }
                  accessibilityLabel={copy.history.useAsReference}
                  onPress={() => useHistoryAsReference(selectedHistory)}>
                  {copy.history.useAsReference}
                </Button>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {selectedHistory ? (
        <ImageViewing
          images={[{uri: selectedHistory.fileUri}]}
          visible={viewerVisible}
          imageIndex={0}
          onRequestClose={() => setViewerVisible(false)}
        />
      ) : null}
    </SafeAreaView>
  );
});
