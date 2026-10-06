import React from 'react';
import {Alert, Image, ScrollView, View} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Share from 'react-native-share';
import {
  ActivityIndicator,
  Button,
  Chip,
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
import {TextInput} from '../../components';
import {Dropdown} from '../../components/ui';
import {isBotConnectorApiUrl} from '../../config/botconnector';
import {useTheme} from '../../hooks';
import {serverStore, uiStore} from '../../store';
import {createStyles} from './styles';

const COPY = {
  en: {
    intro:
      'Generate images with your BotConnector account. Free, plan, and PAYG access are enforced by your account quota.',
    connectTitle: 'Connect BotConnector first',
    connectBody:
      'Open Models → Add Remote Model → Connect BotConnector, then paste your BotConnector API key.',
    model: 'Image model',
    prompt: 'Describe the image',
    promptPlaceholder:
      'Example: a clean product photo of a black AI device on a dark desk',
    generate: 'Generate image',
    generating: 'Generating…',
    share: 'Share',
    retry: 'Refresh models',
    noModels: 'No image models are available for this account right now.',
    generated: 'Generated image',
    reference: 'Reference photos',
    addReference: 'Add photos',
    referenceHint:
      'Use up to 4 JPG, PNG, or WebP images (4 MB each, 8 MB total). Only shown for models that support image references.',
    referenceUnsupported: 'This model does not support reference photos.',
  },
  id: {
    intro:
      'Buat gambar dengan akun BotConnector. Akses gratis, paket, dan PAYG mengikuti kuota akun Anda.',
    connectTitle: 'Hubungkan BotConnector terlebih dahulu',
    connectBody:
      'Buka Model → Tambahkan Model Remote → Hubungkan BotConnector, lalu tempel API key BotConnector.',
    model: 'Model gambar',
    prompt: 'Jelaskan gambar yang ingin dibuat',
    promptPlaceholder:
      'Contoh: foto produk perangkat AI hitam di meja gelap, bersih dan minimal',
    generate: 'Buat gambar',
    generating: 'Membuat…',
    share: 'Bagikan',
    retry: 'Muat ulang model',
    noModels: 'Saat ini tidak ada model gambar yang tersedia untuk akun ini.',
    generated: 'Gambar hasil',
    reference: 'Foto referensi',
    addReference: 'Tambah foto',
    referenceHint:
      'Maksimal 4 JPG, PNG, atau WebP (4 MB per gambar, total 8 MB). Hanya untuk model yang mendukung gambar referensi.',
    referenceUnsupported: 'Model ini tidak mendukung foto referensi.',
  },
};

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
  const copy = uiStore.language === 'id' ? COPY.id : COPY.en;

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
      setError(e instanceof Error ? e.message : 'Unable to load image models.');
    } finally {
      setLoadingModels(false);
    }
  }, [botConnectorServer]);

  React.useEffect(() => {
    loadModels().catch(() => undefined);
  }, [loadModels]);

  const selected = models.find(model => model.id === selectedModel);
  const supportsReferenceImages = selected?.supports_reference_images === true;

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
          uiStore.language === 'id'
            ? `Kuota tersisa: ${result.quotaRemaining}/${result.quotaLimit}`
            : `Quota remaining: ${result.quotaRemaining}/${result.quotaLimit}`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image generation failed.');
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
        e instanceof Error ? e.message : 'Unable to share image.',
      );
    }
  };

  if (!botConnectorServer || !apiKey) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.centerState}>
          <Text variant="titleMedium">{copy.connectTitle}</Text>
          <Text style={styles.muted}>{copy.connectBody}</Text>
          <Button mode="outlined" onPress={() => loadModels()}>
            {copy.retry}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.intro}>{copy.intro}</Text>

        <View style={styles.field}>
          <Text variant="labelLarge">{copy.model}</Text>
          {loadingModels ? (
            <ActivityIndicator />
          ) : models.length > 0 ? (
            <Dropdown
              testID="image-model-dropdown"
              value={selectedModel}
              options={models.map(model => ({
                value: model.id,
                label: `${model.name} · ${model.botconnector_access.toUpperCase()}`,
              }))}
              onChange={setSelectedModel}
            />
          ) : (
            <View style={styles.emptyModels}>
              <Text style={styles.muted}>{copy.noModels}</Text>
              <Button mode="text" onPress={() => loadModels()}>
                {copy.retry}
              </Button>
            </View>
          )}

          {selected ? (
            <View style={styles.modelMeta}>
              <Chip compact>{selected.developer}</Chip>
              <Chip compact>{selected.botconnector_access.toUpperCase()}</Chip>
              {supportsReferenceImages ? (
                <Chip compact>Image → Image</Chip>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.referenceSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Text variant="labelLarge">{copy.reference}</Text>
              <Text style={styles.referenceHint}>
                {supportsReferenceImages
                  ? copy.referenceHint
                  : copy.referenceUnsupported}
              </Text>
            </View>
            <Button
              compact
              mode="outlined"
              icon="image-plus"
              disabled={
                !supportsReferenceImages ||
                referenceImages.length >= MAX_REFERENCE_IMAGES
              }
              onPress={() => addReferenceImages().catch(() => undefined)}>
              {copy.addReference}
            </Button>
          </View>
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

        <View style={styles.field}>
          <Text variant="labelLarge">{copy.prompt}</Text>
          <TextInput
            testID="image-prompt-input"
            value={prompt}
            onChangeText={setPrompt}
            placeholder={copy.promptPlaceholder}
            multiline
            numberOfLines={5}
          />
        </View>

        <Button
          mode="contained"
          testID="generate-image-button"
          loading={generating}
          disabled={generating || !selectedModel || !prompt.trim()}
          onPress={() => generate().catch(() => undefined)}>
          {generating ? copy.generating : copy.generate}
        </Button>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {resultUri ? (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text variant="titleMedium">{copy.generated}</Text>
              {resultAccess ? (
                <Chip compact>{resultAccess.toUpperCase()}</Chip>
              ) : null}
            </View>
            <Image
              testID="generated-image"
              source={{uri: resultUri}}
              resizeMode="contain"
              style={styles.resultImage}
            />
            {quotaText ? <Text style={styles.muted}>{quotaText}</Text> : null}
            <Button mode="outlined" icon="share-variant" onPress={shareResult}>
              {copy.share}
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
});
