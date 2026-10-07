import {
  ALL_IMAGE_SIZES,
  IMAGE_SIZE_FOR_RATIO,
  ratioAvailable,
  resolveAllowedImageSizes,
  sizeForRatio,
} from '../imageGenerationSize';

describe('imageGenerationSize', () => {
  describe('ratio mapping', () => {
    it('maps each aspect-ratio choice to its contract size', () => {
      expect(IMAGE_SIZE_FOR_RATIO.square).toBe('1024x1024');
      expect(IMAGE_SIZE_FOR_RATIO.landscape).toBe('1536x1024');
      expect(IMAGE_SIZE_FOR_RATIO.portrait).toBe('1024x1536');
    });

    it('offers the four contract sizes when the model declares nothing', () => {
      expect(resolveAllowedImageSizes({id: 'google/imagen-4'})).toEqual(
        ALL_IMAGE_SIZES,
      );
    });
  });

  describe('resolveAllowedImageSizes', () => {
    it('prefers botconnector_sizes from GET /v1/media/models', () => {
      expect(
        resolveAllowedImageSizes({
          id: 'bfl/flux-1.1-pro',
          botconnector_sizes: ['auto', '1024x1024', '1536x1024'],
        }),
      ).toEqual(['auto', '1024x1024', '1536x1024']);
    });

    it('ignores unknown size strings from the server', () => {
      expect(
        resolveAllowedImageSizes({
          id: 'x/y',
          botconnector_sizes: ['1024x1024', '999x999', 'auto'],
        }),
      ).toEqual(['1024x1024', 'auto']);
    });

    it('falls back when the server sends an empty or unusable list', () => {
      expect(
        resolveAllowedImageSizes({id: 'x/y', botconnector_sizes: []}),
      ).toEqual(ALL_IMAGE_SIZES);
      expect(
        resolveAllowedImageSizes({id: 'x/y', botconnector_sizes: ['nope']}),
      ).toEqual(ALL_IMAGE_SIZES);
    });

    it('restricts Flux Schnell to auto + 1024x1024 by id or name', () => {
      expect(resolveAllowedImageSizes({id: 'bfl/flux-schnell'})).toEqual([
        'auto',
        '1024x1024',
      ]);
      expect(
        resolveAllowedImageSizes({id: 'x/y', name: 'FLUX.1 [schnell]'}),
      ).toEqual(['auto', '1024x1024']);
    });

    it('does not restrict other Flux models', () => {
      expect(resolveAllowedImageSizes({id: 'bfl/flux-1.1-pro'})).toEqual(
        ALL_IMAGE_SIZES,
      );
    });
  });

  describe('sizeForRatio', () => {
    it('uses the target size when the model allows it', () => {
      expect(sizeForRatio('square', ALL_IMAGE_SIZES)).toBe('1024x1024');
      expect(sizeForRatio('landscape', ALL_IMAGE_SIZES)).toBe('1536x1024');
      expect(sizeForRatio('portrait', ALL_IMAGE_SIZES)).toBe('1024x1536');
    });

    it('falls back to auto when the target is not allowed', () => {
      expect(sizeForRatio('landscape', ['auto', '1024x1024'])).toBe('auto');
    });

    it('falls back to the first allowed size when auto is missing too', () => {
      expect(sizeForRatio('landscape', ['1024x1536'])).toBe('1024x1536');
    });
  });

  describe('ratioAvailable', () => {
    it('is available when the target size is allowed', () => {
      expect(ratioAvailable('square', ['1024x1024'])).toBe(true);
    });

    it('is available when the model can fall back to auto', () => {
      expect(ratioAvailable('portrait', ['auto', '1024x1024'])).toBe(true);
    });

    it('is unavailable when neither the target nor auto is allowed', () => {
      expect(ratioAvailable('landscape', ['1024x1536'])).toBe(false);
    });
  });
});
