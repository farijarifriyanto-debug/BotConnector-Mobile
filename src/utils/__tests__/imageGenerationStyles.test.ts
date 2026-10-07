import {
  aspectOfSize,
  buildImagePrompt,
  IMAGE_STYLES,
} from '../imageGenerationStyles';

describe('imageGenerationStyles', () => {
  it('keeps the idea first and appends the preset words', () => {
    expect(buildImagePrompt('  a red fox  ', 'anime')).toBe(
      'a red fox, anime style, clean line art, vibrant colors',
    );
  });

  it('sends the plain prompt without a style or with an unknown one', () => {
    expect(buildImagePrompt('a red fox', null)).toBe('a red fox');
    expect(buildImagePrompt('a red fox', undefined)).toBe('a red fox');
    expect(buildImagePrompt('a red fox', 'nope' as never)).toBe('a red fox');
  });

  it('has unique ids and non-empty suffixes', () => {
    const ids = IMAGE_STYLES.map(style => style.id);
    expect(new Set(ids).size).toBe(ids.length);
    IMAGE_STYLES.forEach(style =>
      expect(style.suffix.length).toBeGreaterThan(5),
    );
  });

  it('derives the aspect from a size string', () => {
    expect(aspectOfSize('1536x1024')).toBeCloseTo(1.5);
    expect(aspectOfSize('1024x1536')).toBeCloseTo(0.6667, 3);
    expect(aspectOfSize('1024x1024')).toBe(1);
    expect(aspectOfSize('auto')).toBe(1);
    expect(aspectOfSize(undefined)).toBe(1);
  });
});
