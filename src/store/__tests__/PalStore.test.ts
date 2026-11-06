import {runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {palStore} from '../PalStore';
import {palRepository} from '../../repositories/PalRepository';
import type {Pal} from '../../types/pal';
import * as imageUtils from '../../utils/imageUtils';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    clear: jest.fn(async () => values.clear()),
  };
});

// Mock dependencies
jest.mock('../../repositories/PalRepository', () => ({
  palRepository: {
    getAllPals: jest.fn(),
    createPal: jest.fn(),
    updatePal: jest.fn(),
    deletePal: jest.fn(),
    getPalById: jest.fn(),
    checkAndMigrateFromJSON: jest.fn(),
    getLocalPals: jest.fn(),
  },
}));

jest.mock('../../utils/imageUtils', () => ({
  downloadPalThumbnail: jest.fn(),
  deletePalThumbnail: jest.fn(),
}));

// Mock MobX persist
// Stores chain `.then()` on makePersistable (ServerStore is pulled in
// transitively), so keep the real contract: it returns a Promise.
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockResolvedValue(undefined),
}));

describe('PalStore', () => {
  const mockPal: Pal = {
    type: 'local',
    id: 'test-pal-1',
    name: 'Test Pal',
    description: 'A test pal',
    systemPrompt: 'You are a helpful assistant.',
    originalSystemPrompt: 'You are a helpful assistant.',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    source: 'local',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();

    // Reset store state
    runInAction(() => {
      palStore.pals = [];
      palStore.hiddenPalIds = [];
      palStore.isMigrating = false;
      palStore.migrationComplete = false;
    });

    // Setup default mocks
    (palRepository.getAllPals as jest.Mock).mockResolvedValue([]);
    (palRepository.checkAndMigrateFromJSON as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const mockPals = [mockPal];
      (palRepository.getAllPals as jest.Mock).mockResolvedValue(mockPals);

      // Create a new store instance to test initialization
      // eslint-disable-next-line no-new
      new (palStore.constructor as any)();

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(palRepository.checkAndMigrateFromJSON).toHaveBeenCalled();
      expect(palRepository.getAllPals).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      const error = new Error('Database error');
      (palRepository.getAllPals as jest.Mock).mockRejectedValue(error);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Create a new store instance to test initialization
      // eslint-disable-next-line no-new
      new (palStore.constructor as any)();

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading pals from database:',
        error,
      );

      consoleSpy.mockRestore();
    });

    it('does not seed Lookie or Pip on a fresh install (upstream builtins are not BotConnector defaults)', async () => {
      (palRepository.getAllPals as jest.Mock).mockResolvedValue([]);
      (palRepository.createPal as jest.Mock).mockClear();

      // eslint-disable-next-line no-new
      new (palStore.constructor as any)();
      await new Promise(resolve => setTimeout(resolve, 100));

      const upstreamSeeds = (palRepository.createPal as jest.Mock).mock.calls
        .map(call => call[0]?.name)
        .filter(name => name === 'Lookie' || name === 'Pip');
      expect(upstreamSeeds).toEqual([]);
    });
  });

  describe('upstream builtin hiding (spec J)', () => {
    const upstreamLookie: Pal = {
      ...mockPal,
      id: 'lookie-1',
      name: 'Lookie',
      capabilities: {video: true},
      systemPrompt:
        'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
    } as Pal;
    const upstreamPip: Pal = {
      ...mockPal,
      id: 'pip-1',
      name: 'Pip',
      systemPrompt:
        'You are Pip, a friendly and helpful assistant who runs locally on the user’s phone. Keep replies concise and warm.',
    } as Pal;

    const loadFromDb = async (pals: Pal[]) => {
      (palRepository.getAllPals as jest.Mock).mockResolvedValue(pals);
      await (palStore as any).loadPalsFromDatabase();
    };

    beforeEach(() => {
      runInAction(() => {
        palStore.pals = [];
        palStore.hiddenPalIds = [];
      });
      (palRepository.deletePal as jest.Mock).mockResolvedValue(true);
    });

    it('hides existing Lookie/Pip rows from the store and getLocalPals without deleting them', async () => {
      await loadFromDb([upstreamLookie, upstreamPip, mockPal]);

      expect(palStore.pals.map(p => p.id)).toEqual(['test-pal-1']);
      expect(palStore.getLocalPals().map(p => p.id)).toEqual(['test-pal-1']);
      // Hiding never destroys data: no row-level delete or rewrite.
      expect(palRepository.deletePal).not.toHaveBeenCalled();
      expect(palRepository.updatePal).not.toHaveBeenCalled();
    });

    it('persists the hidden ids and the one-time migration flag to storage', async () => {
      await loadFromDb([upstreamLookie, upstreamPip, mockPal]);

      const stored = JSON.parse(
        (await AsyncStorage.getItem('PalStore.builtin.hiddenIds')) ?? '[]',
      );
      expect(stored).toEqual(expect.arrayContaining(['lookie-1', 'pip-1']));
      expect(
        await AsyncStorage.getItem(
          'PalStore.builtin.upstreamDefaultsHidden.v1',
        ),
      ).toBe('true');
    });

    it('applies the persisted hidden ids on later loads (a rename does not resurrect it)', async () => {
      await loadFromDb([upstreamPip, mockPal]);

      const renamed = {...upstreamPip, name: 'My buddy'} as Pal;
      await loadFromDb([renamed, mockPal]);

      expect(palStore.pals.map(p => p.id)).toEqual(['test-pal-1']);
    });

    it('never hides a user-created pal that merely shares the name Pip', async () => {
      const userPip: Pal = {
        ...mockPal,
        id: 'user-pip',
        name: 'Pip',
        systemPrompt: 'You are my private helper named Pip.',
      } as Pal;

      await loadFromDb([upstreamPip, userPip, mockPal]);

      expect(palStore.pals.map(p => p.id)).toEqual(['user-pip', 'test-pal-1']);
    });

    it('does not recreate a deleted upstream builtin on the next initialization', async () => {
      (palRepository.getAllPals as jest.Mock).mockResolvedValue([]);
      (palRepository.createPal as jest.Mock).mockClear();

      await (palStore as any).initialize();

      expect(palRepository.createPal).not.toHaveBeenCalled();
      expect(palStore.pals).toHaveLength(0);
    });
  });

  describe('Core CRUD Operations', () => {
    describe('createPal', () => {
      it('should create a new pal successfully', async () => {
        const newPalData = {
          name: 'New Test Pal',
          description: 'A new test pal',
          systemPrompt: 'You are a helpful assistant.',
          originalSystemPrompt: 'You are a helpful assistant.',
          isSystemPromptChanged: false,
          useAIPrompt: false,
          parameters: {},
          parameterSchema: [],
          source: 'local' as const,
          type: 'local' as const,
        };

        const createdPal = {...newPalData, ...mockPal};
        (palRepository.createPal as jest.Mock).mockResolvedValue(createdPal);

        const result = await palStore.createPal(newPalData);

        expect(palRepository.createPal).toHaveBeenCalledWith(newPalData);
        expect(result).toEqual(createdPal);
        expect(palStore.pals).toContainEqual(createdPal);
      });

      it('should handle creation errors', async () => {
        const error = new Error('Creation failed');
        (palRepository.createPal as jest.Mock).mockRejectedValue(error);

        const newPalData = {
          name: 'New Test Pal',
          systemPrompt: 'You are a helpful assistant.',
          originalSystemPrompt: 'You are a helpful assistant.',
          isSystemPromptChanged: false,
          useAIPrompt: false,
          parameters: {},
          parameterSchema: [],
          source: 'local' as const,
          type: 'local' as const,
        };

        await expect(palStore.createPal(newPalData)).rejects.toThrow(
          'Creation failed',
        );
        expect(palStore.pals).not.toContain(
          expect.objectContaining({name: 'New Test Pal'}),
        );
      });
    });

    describe('updatePal', () => {
      beforeEach(() => {
        runInAction(() => {
          palStore.pals = [mockPal];
        });
      });

      it('should update an existing pal successfully', async () => {
        const updates = {
          name: 'Updated Pal Name',
          description: 'Updated description',
        };
        const updatedPal = {
          ...mockPal,
          ...updates,
          updated_at: '2023-01-02T00:00:00Z',
        };

        (palRepository.updatePal as jest.Mock).mockResolvedValue(updatedPal);

        await palStore.updatePal(mockPal.id, updates);

        expect(palRepository.updatePal).toHaveBeenCalledWith(
          mockPal.id,
          updates,
        );
        expect(palStore.pals[0]).toEqual(updatedPal);
      });

      it('should handle update errors', async () => {
        const error = new Error('Update failed');
        (palRepository.updatePal as jest.Mock).mockRejectedValue(error);

        await expect(
          palStore.updatePal(mockPal.id, {name: 'Updated'}),
        ).rejects.toThrow('Update failed');
      });

      it('should handle case when updated pal is not returned', async () => {
        (palRepository.updatePal as jest.Mock).mockResolvedValue(null);

        await expect(
          palStore.updatePal(mockPal.id, {name: 'Updated'}),
        ).rejects.toThrow('Failed to update pal - no updated pal returned');
      });
    });

    describe('deletePal', () => {
      beforeEach(() => {
        runInAction(() => {
          palStore.pals = [mockPal];
        });
      });

      it('should delete a pal successfully', async () => {
        (palRepository.deletePal as jest.Mock).mockResolvedValue(true);
        (imageUtils.deletePalThumbnail as jest.Mock).mockResolvedValue(
          undefined,
        );

        await palStore.deletePal(mockPal.id);

        expect(palRepository.deletePal).toHaveBeenCalledWith(mockPal.id);
        expect(palStore.pals).not.toContain(mockPal);
      });

      it('should handle deletion errors gracefully', async () => {
        const error = new Error('Deletion failed');
        (palRepository.deletePal as jest.Mock).mockRejectedValue(error);

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        // Should not throw, but should log error
        await palStore.deletePal(mockPal.id);

        expect(consoleSpy).toHaveBeenCalledWith('Error deleting pal:', error);
        expect(palStore.pals).toContainEqual(mockPal); // Should still be there

        consoleSpy.mockRestore();
      });
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      runInAction(() => {
        palStore.pals = [
          mockPal,
          {
            ...mockPal,
            id: 'video-pal',
            name: 'Video Pal',
            capabilities: {video: true},
          },
        ];
      });
    });

    it('should get video pals', () => {
      const videoPals = palStore.getVideoPals();
      expect(videoPals).toHaveLength(1);
      expect(videoPals[0].id).toBe('video-pal');
    });

    it('should get all pals', () => {
      const allPals = palStore.getAllPals();
      expect(allPals).toHaveLength(2);
    });
  });
});
