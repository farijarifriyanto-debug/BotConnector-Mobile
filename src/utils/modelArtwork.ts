/**
 * Metadata-driven artwork registry for AI models (spec I).
 *
 * Resolution order:
 *   1. provider logo — when canonical metadata (developer/provider, model id)
 *      matches a registry entry AND a bundled logo asset exists for it,
 *   2. clean generic AI icon,
 *   3. giant first-letter fallbacks are intentionally NOT part of this system.
 *
 * The registry is keyed by provider, never by individual model ids, so new
 * models resolve automatically as long as their provider metadata is correct.
 */

export interface ArtworkMetadata {
  /** Canonical provider/developer name from catalog metadata. */
  provider?: string | null;
  /** Model display name. */
  name?: string | null;
  /** Exact API id (may carry route prefixes such as `payg:`). */
  modelId?: string | null;
  /** Canonical catalog id used for catalog lookups. */
  canonicalId?: string | null;
}

export interface ProviderArtworkEntry {
  /** Stable key; also the lookup key in the bundled logo asset map. */
  key: string;
  /** Human-readable provider name (used in accessibility labels). */
  name: string;
  /**
   * Lowercase tokens matched against provider name + model id/name metadata.
   * Tokens match on word start, so `qwen` also matches `qwen3.5` style ids.
   */
  tokens: readonly string[];
}

/**
 * Provider-level logo registry. Add an entry here (plus a bundled asset in
 * `src/components/ModelArtwork`) to introduce a new provider logo — never
 * per-model hardcoding.
 */
export const PROVIDER_ARTWORK_REGISTRY: readonly ProviderArtworkEntry[] = [
  {
    key: 'google',
    name: 'Google',
    tokens: ['google', 'gemini', 'deepmind', 'gemma', 'imagen'],
  },
  {
    key: 'openai',
    name: 'OpenAI',
    tokens: ['openai', 'chatgpt', 'gpt', 'dalle', 'dall'],
  },
  {key: 'anthropic', name: 'Anthropic', tokens: ['anthropic', 'claude']},
  {key: 'qwen', name: 'Qwen', tokens: ['qwen', 'tongyi']},
  {key: 'deepseek', name: 'DeepSeek', tokens: ['deepseek']},
  {key: 'meta', name: 'Meta', tokens: ['meta', 'llama']},
  {key: 'mistral', name: 'Mistral', tokens: ['mistral']},
  {key: 'microsoft', name: 'Microsoft', tokens: ['microsoft', 'azure']},
  {
    key: 'black-forest-labs',
    name: 'Black Forest Labs',
    tokens: ['black forest labs', 'bfl', 'flux'],
  },
  {
    key: 'stability',
    name: 'Stability AI',
    tokens: ['stability', 'stable diffusion', 'sdxl'],
  },
  {
    key: 'bytedance',
    name: 'ByteDance',
    tokens: ['bytedance', 'seedream', 'seedance', 'doubao'],
  },
  {key: 'ideogram', name: 'Ideogram', tokens: ['ideogram']},
  {key: 'recraft', name: 'Recraft', tokens: ['recraft']},
  {key: 'leonardo', name: 'Leonardo', tokens: ['leonardo']},
];

export type ModelArtworkKind = 'provider' | 'generic';

export interface ModelArtwork {
  kind: ModelArtworkKind;
  /** Registry key — only set when a provider entry matched. */
  providerKey?: string;
  /** Display name of the matched provider — only set alongside `providerKey`. */
  providerName?: string;
}

const normalize = (value: string | null | undefined): string =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolve artwork metadata to a registry entry (or the generic fallback).
 * Never yields a letter/initials fallback.
 */
export function resolveModelArtwork(
  metadata?: ArtworkMetadata | null,
): ModelArtwork {
  const haystack = normalize(
    [
      metadata?.provider,
      metadata?.modelId,
      metadata?.canonicalId,
      metadata?.name,
    ]
      .filter(Boolean)
      .join(' '),
  );

  if (!haystack) {
    return {kind: 'generic'};
  }

  for (const entry of PROVIDER_ARTWORK_REGISTRY) {
    const matched = entry.tokens.some(token => {
      const normalizedToken = normalize(token);
      if (!normalizedToken) {
        return false;
      }
      // Word-start match: `qwen` hits `qwen image`, `qwen3`, `payg:qwen:...`.
      return new RegExp(`(?:^| )${escapeRegExp(normalizedToken)}`).test(
        haystack,
      );
    });
    if (matched) {
      return {
        kind: 'provider',
        providerKey: entry.key,
        providerName: entry.name,
      };
    }
  }

  return {kind: 'generic'};
}
