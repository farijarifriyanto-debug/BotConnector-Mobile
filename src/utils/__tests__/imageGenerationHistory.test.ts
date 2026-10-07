import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  IMAGE_HISTORY_LIMIT,
  IMAGE_HISTORY_STORAGE_KEY,
  ImageHistoryEntry,
  imageHistoryDir,
  listImageHistory,
  readHistoryImageAsDataUri,
  removeImageHistoryEntry,
  saveGeneratedImage,
  toggleImageHistoryFavorite,
} from '../imageGenerationHistory';

const PNG_ENTRY = {
  b64: 'ZmFrZS1pbWFnZQ==',
  mimeType: 'image/png',
  prompt: 'a minimal robot',
  modelId: 'img-free',
  modelName: 'Image Free',
  size: '1024x1024',
};

describe('imageGenerationHistory', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (RNFS as any).__resetMockState?.();
    jest.clearAllMocks();
  });

  it('returns an empty list when nothing is stored', async () => {
    await expect(listImageHistory()).resolves.toEqual([]);
  });

  it('returns an empty list when the stored metadata is corrupt', async () => {
    await AsyncStorage.setItem(IMAGE_HISTORY_STORAGE_KEY, '{not-json');
    await expect(listImageHistory()).resolves.toEqual([]);
  });

  it('writes the full image to the document dir and records metadata', async () => {
    const entry = await saveGeneratedImage(PNG_ENTRY);

    expect(RNFS.mkdir).toHaveBeenCalledWith(imageHistoryDir());
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(`${imageHistoryDir()}/`),
      PNG_ENTRY.b64,
      'base64',
    );
    expect(entry.fileUri.startsWith('file://')).toBe(true);
    expect(entry.fileUri.endsWith('.png')).toBe(true);
    expect(entry).toMatchObject({
      prompt: PNG_ENTRY.prompt,
      modelId: 'img-free',
      modelName: 'Image Free',
      size: '1024x1024',
      mimeType: 'image/png',
      favorite: false,
    });
    await expect(listImageHistory()).resolves.toEqual([entry]);
  });

  it('maps mime types to file extensions', async () => {
    const jpg = await saveGeneratedImage({
      ...PNG_ENTRY,
      mimeType: 'image/jpeg',
    });
    const webp = await saveGeneratedImage({
      ...PNG_ENTRY,
      mimeType: 'image/webp',
    });
    expect(jpg.fileUri.endsWith('.jpg')).toBe(true);
    expect(webp.fileUri.endsWith('.webp')).toBe(true);
  });

  it('keeps only the newest IMAGE_HISTORY_LIMIT entries and unlinks evicted files', async () => {
    const saved: ImageHistoryEntry[] = [];
    for (let i = 0; i < IMAGE_HISTORY_LIMIT + 2; i++) {
      saved.push(await saveGeneratedImage({...PNG_ENTRY, prompt: `p-${i}`}));
    }

    const list = await listImageHistory();
    expect(list).toHaveLength(IMAGE_HISTORY_LIMIT);
    // Newest stays, oldest two are gone from metadata...
    expect(list[0].prompt).toBe(`p-${IMAGE_HISTORY_LIMIT + 1}`);
    expect(list.some(entry => entry.prompt === 'p-0')).toBe(false);
    // ...and their files were deleted from disk.
    expect(RNFS.unlink).toHaveBeenCalledWith(
      saved[0].fileUri.replace('file://', ''),
    );
    expect(RNFS.unlink).toHaveBeenCalledWith(
      saved[1].fileUri.replace('file://', ''),
    );
  });

  it('protects favorites from eviction while the list is full', async () => {
    const saved: ImageHistoryEntry[] = [];
    for (let i = 0; i < IMAGE_HISTORY_LIMIT; i++) {
      saved.push(await saveGeneratedImage({...PNG_ENTRY, prompt: `p-${i}`}));
    }
    const kept = await toggleImageHistoryFavorite(saved[0].id);
    expect(kept.find(entry => entry.id === saved[0].id)?.favorite).toBe(true);

    await saveGeneratedImage({...PNG_ENTRY, prompt: 'p-new'});
    const list = await listImageHistory();
    expect(list).toHaveLength(IMAGE_HISTORY_LIMIT);
    // The favorite (oldest) survived; the next-oldest was evicted instead.
    expect(list.some(entry => entry.id === saved[0].id)).toBe(true);
    expect(list.some(entry => entry.id === saved[1].id)).toBe(false);
  });

  it('toggles the favorite flag and persists it', async () => {
    const entry = await saveGeneratedImage(PNG_ENTRY);
    await toggleImageHistoryFavorite(entry.id);
    expect((await listImageHistory())[0].favorite).toBe(true);
    await toggleImageHistoryFavorite(entry.id);
    expect((await listImageHistory())[0].favorite).toBe(false);
  });

  it('removes metadata and unlinks the file on delete', async () => {
    const entry = await saveGeneratedImage(PNG_ENTRY);
    const list = await removeImageHistoryEntry(entry.id);

    expect(list).toEqual([]);
    expect(RNFS.unlink).toHaveBeenCalledWith(
      entry.fileUri.replace('file://', ''),
    );
    await expect(listImageHistory()).resolves.toEqual([]);
  });

  it('reads an entry back as a data URI for use as a reference photo', async () => {
    (RNFS.readFile as jest.Mock).mockImplementation(() =>
      Promise.resolve('QUJD'),
    );
    const entry = await saveGeneratedImage(PNG_ENTRY);

    await expect(readHistoryImageAsDataUri(entry)).resolves.toBe(
      'data:image/png;base64,QUJD',
    );
  });
});
