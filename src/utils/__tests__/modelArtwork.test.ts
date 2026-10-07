import {PROVIDER_ARTWORK_REGISTRY, resolveModelArtwork} from '../modelArtwork';

describe('resolveModelArtwork', () => {
  it('returns the generic fallback when there is no metadata', () => {
    expect(resolveModelArtwork(null)).toEqual({kind: 'generic'});
    expect(resolveModelArtwork(undefined)).toEqual({kind: 'generic'});
    expect(resolveModelArtwork({})).toEqual({kind: 'generic'});
    expect(resolveModelArtwork({provider: '', name: ''})).toEqual({
      kind: 'generic',
    });
  });

  it('matches on canonical provider metadata', () => {
    expect(resolveModelArtwork({provider: 'Google'})).toEqual({
      kind: 'provider',
      providerKey: 'google',
      providerName: 'Google',
    });
    expect(
      resolveModelArtwork({provider: 'Black Forest Labs'}).providerKey,
    ).toBe('black-forest-labs');
    expect(resolveModelArtwork({provider: 'Stability AI'}).providerKey).toBe(
      'stability',
    );
  });

  it('falls back to model id/name metadata when the provider field is missing', () => {
    expect(resolveModelArtwork({name: 'Qwen Image'}).providerKey).toBe('qwen');
    expect(
      resolveModelArtwork({modelId: 'payg:deepseek/deepseek-v4.1-flash'})
        .providerKey,
    ).toBe('deepseek');
    expect(resolveModelArtwork({name: 'Flux 1.1 Pro'}).providerKey).toBe(
      'black-forest-labs',
    );
    expect(resolveModelArtwork({name: 'Seedream 4.0'}).providerKey).toBe(
      'bytedance',
    );
    expect(resolveModelArtwork({name: 'Imagen 4'}).providerKey).toBe('google');
  });

  it('matches on word starts so lookalike names do not steal a logo', () => {
    // `gpt` must match `gpt-6` …
    expect(resolveModelArtwork({name: 'GPT-6'}).providerKey).toBe('openai');
    // … but not a name that merely contains the letters.
    expect(resolveModelArtwork({name: 'Cheggpt'}).kind).toBe('generic');
    expect(resolveModelArtwork({name: 'Vortex'}).kind).toBe('generic');
  });

  it('never yields a letter/initials fallback', () => {
    const inputs = [
      null,
      {},
      {name: 'Qwen3 30B'},
      {name: 'Voxtral Mini'},
      {provider: 'Some Unknown Labs'},
    ] as const;

    for (const input of inputs) {
      const artwork = resolveModelArtwork(input);
      expect(artwork.kind === 'provider' || artwork.kind === 'generic').toBe(
        true,
      );
      for (const key of Object.keys(artwork)) {
        expect(['kind', 'providerKey', 'providerName']).toContain(key);
      }
      expect(Object.keys(artwork)).not.toContain('letter');
      expect(Object.keys(artwork)).not.toContain('initials');
      if (artwork.kind === 'generic') {
        expect(artwork.providerKey).toBeUndefined();
      }
    }
  });

  describe('provider registry', () => {
    it('is keyed by provider, never by individual model ids', () => {
      const keys = PROVIDER_ARTWORK_REGISTRY.map(entry => entry.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const entry of PROVIDER_ARTWORK_REGISTRY) {
        expect(entry.tokens.length).toBeGreaterThan(0);
        expect(entry).not.toHaveProperty('models');
        expect(entry).not.toHaveProperty('modelIds');
        expect(entry).not.toHaveProperty('ids');
      }
    });

    it('covers the image-model providers shipped in the catalog', () => {
      const imageProviders = [
        {provider: 'Google', key: 'google'},
        {provider: 'Black Forest Labs', key: 'black-forest-labs'},
        {provider: 'Stability AI', key: 'stability'},
        {provider: 'Ideogram', key: 'ideogram'},
        {provider: 'Recraft', key: 'recraft'},
        {provider: 'ByteDance', key: 'bytedance'},
      ];
      for (const {provider, key} of imageProviders) {
        expect(resolveModelArtwork({provider}).providerKey).toBe(key);
      }
    });
  });
});
