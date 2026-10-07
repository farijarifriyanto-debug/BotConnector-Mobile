/**
 * Optional look presets: they only append descriptive words to the prompt on
 * the client (the server still sees one plain prompt, and the history keeps
 * the user's own text). Same words as the web Image Studio.
 */
export const IMAGE_STYLES = [
  {
    id: 'photo',
    suffix: 'photorealistic, natural lighting, sharp focus, high detail',
  },
  {
    id: 'cinematic',
    suffix:
      'cinematic still, dramatic lighting, shallow depth of field, film grain',
  },
  {id: 'anime', suffix: 'anime style, clean line art, vibrant colors'},
  {
    id: '3d',
    suffix: '3D render, soft studio lighting, smooth materials, octane render',
  },
  {
    id: 'illustration',
    suffix: 'digital illustration, flat shapes, bold colors, clean composition',
  },
  {
    id: 'logo',
    suffix:
      'minimal vector logo, simple geometric shapes, flat design, white background',
  },
  {id: 'watercolor', suffix: 'watercolor painting, soft washes, paper texture'},
  {id: 'pixel', suffix: 'pixel art, 16-bit, limited palette'},
] as const;

export type ImageStyleId = (typeof IMAGE_STYLES)[number]['id'];

/** Prompt actually sent: the user's idea first (most weight), then the style words. */
export function buildImagePrompt(
  prompt: string,
  style: ImageStyleId | null | undefined,
): string {
  const text = prompt.trim();
  const preset = IMAGE_STYLES.find(item => item.id === style);
  return preset ? `${text}, ${preset.suffix}` : text;
}

/** Width / height of a `WxH` size string; 1 for `auto` or anything unknown. */
export function aspectOfSize(size: string | undefined): number {
  const match = /^(\d+)x(\d+)$/.exec(size ?? '');
  if (!match) {
    return 1;
  }
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}
