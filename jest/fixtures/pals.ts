import type {Pal} from '../../src/types/pal';
import {downloadedModel, basicModel} from './models';

// Basic local pal
export const mockLocalPal: Pal = {
  type: 'local',
  id: 'local-pal-1',
  name: 'Test Assistant',
  description: 'A helpful test assistant',
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

// Local pal with model
export const mockLocalPalWithModel: Pal = {
  ...mockLocalPal,
  id: 'local-pal-2',
  name: 'Test Pal with Model',
  defaultModel: downloadedModel,
};

// Local pal with parameters (roleplay)
export const mockRoleplayPal: Pal = {
  type: 'local',
  id: 'roleplay-pal-1',
  name: 'Fantasy Roleplay',
  description: 'A fantasy roleplay character',
  systemPrompt: 'You are a {{aiRole}} in {{world}} at {{location}}.',
  originalSystemPrompt: 'You are a {{aiRole}} in {{world}} at {{location}}.',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    world: 'Medieval Kingdom',
    location: 'Castle Throne Room',
    aiRole: 'Wise Wizard',
  },
  parameterSchema: [
    {
      key: 'world',
      type: 'text',
      label: 'World',
      required: true,
      placeholder: 'e.g., Medieval fantasy kingdom',
    },
    {
      key: 'location',
      type: 'text',
      label: 'Location',
      required: true,
      placeholder: 'e.g., Royal castle throne room',
    },
    {
      key: 'aiRole',
      type: 'text',
      label: 'AI Role',
      required: true,
      placeholder: 'e.g., Wise wizard advisor',
    },
  ],
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local pal with video capability
export const mockVideoPal: Pal = {
  type: 'local',
  id: 'video-pal-1',
  name: 'Video Assistant',
  description: 'A video-enabled assistant',
  systemPrompt: 'You are a video assistant.',
  originalSystemPrompt: 'You are a video assistant.',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    captureInterval: '3000',
  },
  parameterSchema: [
    {
      key: 'captureInterval',
      type: 'text',
      label: 'Capture Interval (ms)',
      required: true,
      placeholder: '3000',
    },
  ],
  capabilities: {
    video: true,
    multimodal: true,
  },
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local pal with AI-generated prompt
export const mockAIPal: Pal = {
  type: 'local',
  id: 'ai-pal-1',
  name: 'AI Generated Pal',
  description: 'A pal with AI-generated system prompt',
  systemPrompt: 'You are a helpful coding assistant.',
  originalSystemPrompt: 'You are a helpful coding assistant.',
  isSystemPromptChanged: false,
  useAIPrompt: true,
  generatingPrompt: 'Create a coding assistant',
  promptGenerationModel: basicModel,
  parameters: {},
  parameterSchema: [],
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

// Local pal with custom color
export const mockColoredPal: Pal = {
  ...mockLocalPal,
  id: 'colored-pal-1',
  name: 'Colored Pal',
  color: ['#FF5733', '#C70039'],
};

// Local pal with completion settings
export const mockPalWithSettings: Pal = {
  ...mockLocalPal,
  id: 'pal-with-settings-1',
  name: 'Pal with Settings',
  completionSettings: {
    temperature: 0.8,
    top_p: 0.9,
    max_tokens: 2048,
  },
};

// Partial pal for creation
export const mockNewPalData: Partial<Pal> = {
  type: 'local',
  name: '',
  description: '',
  systemPrompt: '',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: [],
  source: 'local',
};

// Factory function for creating custom pals
export const createPal = (overrides: Partial<Pal> = {}): Pal => ({
  ...mockLocalPal,
  ...overrides,
});

export const palsList: Pal[] = [
  mockLocalPal,
  mockLocalPalWithModel,
  mockRoleplayPal,
  mockVideoPal,
  mockAIPal,
  mockColoredPal,
  mockPalWithSettings,
];
