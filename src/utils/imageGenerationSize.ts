/**
 * Size contract for POST /v1/images/generations:
 * `size ∈ auto | 1024x1024 | 1536x1024 | 1024x1536`, narrowed per model when
 * GET /v1/media/models sends `botconnector_sizes`. Flux Schnell only supports
 * auto / 1024x1024, so when the server omits the field we narrow by name.
 */

export type ImageSizeRatio = 'square' | 'landscape' | 'portrait';

export const IMAGE_SIZE_FOR_RATIO: Record<ImageSizeRatio, string> = {
  square: '1024x1024',
  landscape: '1536x1024',
  portrait: '1024x1536',
};

export const ALL_IMAGE_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536'];

const FLUX_SCHNELL_SIZES = ['auto', '1024x1024'];

const isKnownSize = (value: unknown): value is string =>
  typeof value === 'string' && ALL_IMAGE_SIZES.includes(value);

export function resolveAllowedImageSizes(model: {
  id?: string;
  name?: string;
  botconnector_sizes?: unknown;
}): string[] {
  if (Array.isArray(model.botconnector_sizes)) {
    const declared = model.botconnector_sizes.filter(isKnownSize);
    const deduped = [...new Set(declared)];
    if (deduped.length > 0) {
      return deduped;
    }
  }
  const label = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase();
  if (label.includes('flux') && label.includes('schnell')) {
    return FLUX_SCHNELL_SIZES;
  }
  return ALL_IMAGE_SIZES;
}

/** Target size, then `auto`, then whatever the model allows first. */
export function sizeForRatio(ratio: ImageSizeRatio, allowed: string[]): string {
  const target = IMAGE_SIZE_FOR_RATIO[ratio];
  if (allowed.includes(target)) {
    return target;
  }
  if (allowed.includes('auto')) {
    return 'auto';
  }
  return allowed[0] ?? 'auto';
}

/** A ratio chip stays tappable when the target or an `auto` fallback exists. */
export function ratioAvailable(
  ratio: ImageSizeRatio,
  allowed: string[],
): boolean {
  if (allowed.includes(IMAGE_SIZE_FOR_RATIO[ratio])) {
    return true;
  }
  return allowed.length > 0 && allowed.includes('auto');
}
