import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNFS from '@dr.pogodin/react-native-fs';

/**
 * Local history for generated images: full images live in the document
 * directory (survive cache purges), the index lives in AsyncStorage. Caps the
 * list at IMAGE_HISTORY_LIMIT and unlinks evicted files; favorites are
 * evicted last.
 */

export interface ImageHistoryEntry {
  id: string;
  /** file:// URI of the full-size image. */
  fileUri: string;
  prompt: string;
  modelId: string;
  modelName?: string;
  size?: string;
  mimeType: string;
  favorite: boolean;
  createdAt: number;
}

export const IMAGE_HISTORY_STORAGE_KEY = 'botconnector.imageHistory.v1';
export const IMAGE_HISTORY_LIMIT = 50;

const stripFileScheme = (uri: string): string =>
  uri.startsWith('file://') ? uri.slice('file://'.length) : uri;

export function imageHistoryDir(): string {
  return `${RNFS.DocumentDirectoryPath}/botconnector-image-history`;
}

const extensionForMime = (mime: string): string => {
  if (mime.includes('jpeg') || mime.includes('jpg')) {
    return 'jpg';
  }
  if (mime.includes('webp')) {
    return 'webp';
  }
  return 'png';
};

async function readList(): Promise<ImageHistoryEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(IMAGE_HISTORY_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as ImageHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeList(list: ImageHistoryEntry[]): Promise<void> {
  await AsyncStorage.setItem(IMAGE_HISTORY_STORAGE_KEY, JSON.stringify(list));
}

async function evictOverLimit(
  list: ImageHistoryEntry[],
): Promise<ImageHistoryEntry[]> {
  const next = [...list];
  while (next.length > IMAGE_HISTORY_LIMIT) {
    // Oldest non-favorite first; only evict favorites as a last resort.
    let index = next.length - 1;
    while (index >= 0 && next[index].favorite) {
      index -= 1;
    }
    if (index < 0) {
      index = next.length - 1;
    }
    const [evicted] = next.splice(index, 1);
    if (evicted) {
      RNFS.unlink(stripFileScheme(evicted.fileUri)).catch(() => undefined);
    }
  }
  return next;
}

export async function listImageHistory(): Promise<ImageHistoryEntry[]> {
  return readList();
}

export async function saveGeneratedImage(input: {
  b64: string;
  mimeType?: string;
  prompt: string;
  modelId: string;
  modelName?: string;
  size?: string;
}): Promise<ImageHistoryEntry> {
  const mimeType = input.mimeType || 'image/png';
  const dir = imageHistoryDir();
  await RNFS.mkdir(dir);
  const id = `img-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const path = `${dir}/${id}.${extensionForMime(mimeType)}`;
  await RNFS.writeFile(path, input.b64, 'base64');

  const entry: ImageHistoryEntry = {
    id,
    fileUri: `file://${path}`,
    prompt: input.prompt,
    modelId: input.modelId,
    modelName: input.modelName,
    size: input.size,
    mimeType,
    favorite: false,
    createdAt: Date.now(),
  };
  const list = await evictOverLimit([entry, ...(await readList())]);
  await writeList(list);
  return entry;
}

export async function toggleImageHistoryFavorite(
  id: string,
): Promise<ImageHistoryEntry[]> {
  const list = (await readList()).map(entry =>
    entry.id === id ? {...entry, favorite: !entry.favorite} : entry,
  );
  await writeList(list);
  return list;
}

export async function removeImageHistoryEntry(
  id: string,
): Promise<ImageHistoryEntry[]> {
  const list = await readList();
  const entry = list.find(item => item.id === id);
  if (entry) {
    RNFS.unlink(stripFileScheme(entry.fileUri)).catch(() => undefined);
  }
  const next = list.filter(item => item.id !== id);
  await writeList(next);
  return next;
}

export async function readHistoryImageAsDataUri(
  entry: Pick<ImageHistoryEntry, 'fileUri' | 'mimeType'>,
): Promise<string> {
  const content = await RNFS.readFile(stripFileScheme(entry.fileUri), 'base64');
  return `data:${entry.mimeType};base64,${content}`;
}
