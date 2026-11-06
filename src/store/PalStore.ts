/**
 * PalStore - Dynamic Parameter Pal Store
 *
 * This is the new pal store that replaces the legacy PalStore with a flexible,
 * schema-driven approach that supports dynamic parameters and custom pal types.
 *
 * KEY FEATURES:
 * - Dynamic parameter schemas: Create pals with any custom parameters
 * - Unified UI: Single PalSheet component works for all pal types
 * - Extensible: Easy to add new parameter types (text, select, datetime_tag)
 * - Migration: Automatically migrates data from legacy PalStore on startup
 *
 * @see src/types/pal.ts for type definitions
 * @see src/utils/pal-migration.ts for migration utilities
 * @see src/components/PalsSheets/PalSheet.tsx for unified UI component
 */

import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {palRepository} from '../repositories/PalRepository';

import {registerDefaultTalents} from '../services/talents';

import type {Pal} from '../types/pal';

import {deletePalThumbnail} from '../utils/imageUtils';

// Track each built-in separately so future defaults can still be introduced.
// TODO: when adding another built-in pal, extract a shared seed-once helper
// (check key, find existing, create, set key) instead of a third copy.

// Spec J: Lookie/Pip (upstream PocketPal builtins) are no longer seeded and
// are hidden from every list surface. Existing rows are kept in the database;
// only their ids are remembered here so the hide survives restarts without
// touching user data.
const HIDDEN_IDS_KEY = 'PalStore.builtin.hiddenIds';
const HIDDEN_MIGRATED_KEY = 'PalStore.builtin.upstreamDefaultsHidden.v1';

/**
 * One-time signature match for rows that were seeded by upstream releases
 * (boot-time Lookie/Pip seeds and the onboarding Pip). A user-created pal
 * that merely shares the name does not carry the upstream system prompt, so
 * it never matches; after the migration runs once, ids alone decide.
 */
const isUpstreamBuiltinPal = (pal: Pal): boolean => {
  const prompt = pal.systemPrompt || '';
  if (pal.name === 'Pip' && prompt.includes('You are Pip')) {
    return true;
  }
  if (
    pal.name === 'Lookie' &&
    (prompt.includes('You are Lookie') || pal.capabilities?.video === true)
  ) {
    return true;
  }
  return false;
};

class PalStore {
  // Core pals storage
  pals: Pal[] = [];

  // Spec J: ids of upstream builtin pals (Lookie/Pip) masked from every list
  // surface. The rows themselves are never deleted from the database.
  hiddenPalIds: string[] = [];

  // Migration state
  isMigrating: boolean = false;
  migrationComplete: boolean = false;
  migrationVersion: string = '1.0';

  constructor() {
    makeAutoObservable(this);
    this.initialize();
    console.log('Pal store initialized');
    console.log('Pals number: ', this.pals.length);
  }

  async initialize() {
    try {
      runInAction(() => {
        this.isMigrating = true;
      });

      // Migrate from JSON/AsyncStorage to database
      await palRepository.checkAndMigrateFromJSON();

      // Load pals from database (upstream Lookie/Pip are masked here; they
      // are no longer seeded — spec J).
      await this.loadPalsFromDatabase();

      // Register talent engines (idempotent)
      registerDefaultTalents();

      console.log('Pal store initialization completed');

      runInAction(() => {
        this.isMigrating = false;
        this.migrationComplete = true;
      });
    } catch (error) {
      console.error('Failed to initialize pal store:', error);
      runInAction(() => {
        this.isMigrating = false;
        this.migrationComplete = false;
      });
    }
  }

  /**
   * Load pals from database into MobX store
   */
  private async loadPalsFromDatabase() {
    try {
      const pals = await palRepository.getAllPals();
      const hiddenIds = await this.resolveHiddenPalIds(pals);
      runInAction(() => {
        this.hiddenPalIds = hiddenIds;
        this.pals = Array.isArray(pals)
          ? pals.filter(p => !hiddenIds.includes(p.id))
          : pals;
      });
    } catch (error) {
      console.error('Error loading pals from database:', error);
    }
  }

  /**
   * Ids to mask (spec J): previously persisted ones plus — until the
   * one-time migration flag exists — any row still matching the upstream
   * Lookie/Pip signature. Never throws: a storage failure fails open and
   * leaves the visible list unfiltered for this session.
   */
  private async resolveHiddenPalIds(pals: Pal[]): Promise<string[]> {
    try {
      let ids: string[] = [];
      const stored = await AsyncStorage.getItem(HIDDEN_IDS_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            ids = parsed.filter((x): x is string => typeof x === 'string');
          }
        } catch {
          // Corrupt payload: ignore and rescan below if not yet migrated.
        }
      }

      const migrated =
        (await AsyncStorage.getItem(HIDDEN_MIGRATED_KEY)) === 'true';
      if (!migrated) {
        const scanned = (Array.isArray(pals) ? pals : [])
          .filter(isUpstreamBuiltinPal)
          .map(p => p.id)
          .filter(id => !ids.includes(id));
        ids = [...ids, ...scanned];
        await AsyncStorage.setItem(HIDDEN_IDS_KEY, JSON.stringify(ids));
        await AsyncStorage.setItem(HIDDEN_MIGRATED_KEY, 'true');
      }
      return ids;
    } catch (error) {
      console.warn('Failed to resolve hidden builtin pals:', error);
      return [];
    }
  }

  // Core unified pal management methods

  /**
   * Adds a pal to both repository and store (handles persistence + state)
   * This is the ONLY method that should handle repository + store updates
   */
  private addPal = async (
    palData: Omit<Pal, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Pal> => {
    const savedPal = await palRepository.createPal(palData);

    runInAction(() => {
      this.pals.push(savedPal);
    });

    return savedPal;
  };

  /**
   * Creates a new pal
   */
  createPal = async (
    palData: Omit<Pal, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Pal> => {
    return this.addPal(palData);
  };

  /**
   * Updates an existing pal
   */
  updatePal = async (id: string, updates: Partial<Pal>): Promise<void> => {
    try {
      const updatedPal = await palRepository.updatePal(id, updates);
      if (updatedPal) {
        runInAction(() => {
          const palIndex = this.pals.findIndex(p => p.id === id);
          if (palIndex !== -1) {
            this.pals[palIndex] = updatedPal;
          }
        });
      } else {
        throw new Error('Failed to update pal - no updated pal returned');
      }
    } catch (error) {
      console.error('Error updating pal:', error);
      throw error; // Re-throw so calling code can handle it
    }
  };

  /**
   * Deletes a pal
   */
  deletePal = async (id: string): Promise<void> => {
    try {
      // Find the pal to get its thumbnail path before deletion
      const palIndex = this.pals.findIndex(p => p.id === id);
      const pal = palIndex !== -1 ? this.pals[palIndex] : null;

      const success = await palRepository.deletePal(id);
      if (success) {
        // Clean up local thumbnail image if it exists
        if (pal?.thumbnail_url) {
          try {
            await deletePalThumbnail(pal.thumbnail_url);
          } catch (imageError) {
            console.warn('Failed to delete thumbnail image:', imageError);
            // Don't fail the entire deletion if image cleanup fails
          }
        }

        runInAction(() => {
          if (palIndex !== -1) {
            this.pals.splice(palIndex, 1);
          }
        });
      }
    } catch (error) {
      console.error('Error deleting pal:', error);
    }
  };

  /**
   * Gets all pals
   */
  getPals = (): Pal[] => {
    return this.pals;
  };

  /**
   * Gets a pal by ID
   */
  getPalById = (id: string): Pal | undefined => {
    return this.pals.find(p => p.id === id);
  };

  getLocalPals = () => {
    return this.pals.filter(
      pal =>
        (pal.source === 'local' || !pal.source) &&
        !this.hiddenPalIds.includes(pal.id),
    );
  };

  // Capability-based filtering methods
  getVideoPals = () => {
    return this.pals.filter(pal => pal.capabilities?.video === true);
  };

  getAllPals = () => {
    return this.pals;
  };
}

export const palStore = new PalStore();

// Export types for external use
export type {Pal} from '../types/pal';
export type {LegacyPalData} from '../utils/pal-migration';
