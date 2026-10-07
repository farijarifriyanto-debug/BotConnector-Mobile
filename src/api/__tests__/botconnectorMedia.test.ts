import {
  BotConnectorImageError,
  classifyImageGenerationError,
  fetchBotConnectorImageModels,
  generateBotConnectorImage,
} from '../botconnectorMedia';

const abortError = () =>
  Object.assign(new Error('Aborted'), {name: 'AbortError'});

describe('BotConnector media API', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('loads image models and filters out non-image media', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        data: [
          {
            id: 'img-free',
            name: 'Image Free',
            developer: 'Test',
            category: 'image',
            botconnector_modality: 'image',
            botconnector_access: 'free',
            botconnector_sizes: ['auto', '1024x1024'],
          },
          {
            id: 'tts',
            name: 'TTS',
            developer: 'Test',
            category: 'audio',
            botconnector_modality: 'audio',
            botconnector_access: 'payg',
          },
        ],
      }),
    } as any);

    await expect(
      fetchBotConnectorImageModels({
        serverUrl: 'https://api.botconnector.id/',
        apiKey: 'bc_live_test',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'img-free',
        botconnector_access: 'free',
        botconnector_sizes: ['auto', '1024x1024'],
      }),
    ]);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.botconnector.id/v1/media/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer bc_live_test',
        }),
      }),
    );
  });

  it('generates one image and returns the full quota metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        created: 1,
        data: [{b64_json: 'ZmFrZS1pbWFnZQ=='}],
        botconnector: {
          mime_type: 'image/png',
          access: 'plan',
          image_quota: {
            tier: 'free',
            remaining: 9,
            limit: 10,
            period: 'day',
          },
        },
      }),
    } as any);

    await expect(
      generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'a dark minimal robot',
        size: '1536x1024',
      }),
    ).resolves.toEqual({
      b64: 'ZmFrZS1pbWFnZQ==',
      mimeType: 'image/png',
      access: 'plan',
      quota: {tier: 'free', remaining: 9, limit: 10, period: 'day'},
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.botconnector.id/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'img-free',
          prompt: 'a dark minimal robot',
          n: 1,
          size: '1536x1024',
        }),
      }),
    );
  });

  it('sends reference images only when provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        created: 1,
        data: [{b64_json: 'ZmFrZS1pbWFnZQ=='}],
        botconnector: {mime_type: 'image/png'},
      }),
    } as any);

    const referenceImages = ['data:image/jpeg;base64,ZmFrZS1yZWZlcmVuY2U='];
    await generateBotConnectorImage({
      serverUrl: 'https://api.botconnector.id',
      apiKey: 'bc_live_test',
      model: 'img-edit',
      prompt: 'make it sunset',
      referenceImages,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.botconnector.id/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'img-edit',
          prompt: 'make it sunset',
          n: 1,
          size: '1024x1024',
          inputs: {referenceImages},
        }),
      }),
    );
  });

  describe('classifyImageGenerationError', () => {
    it.each<[number, string | undefined, string]>([
      [429, 'image_quota_reached', 'quota_exhausted'],
      [400, 'image_quota_reached', 'quota_exhausted'],
      [429, 'free_daily_budget_exhausted', 'quota_exhausted'],
      [403, 'image_plan_required', 'plan_required'],
      [402, 'payg_balance_required', 'balance_required'],
      [402, undefined, 'balance_required'],
      [429, undefined, 'rate_limited'],
      [401, undefined, 'unauthorized'],
      [500, undefined, 'server'],
    ])('maps status %i code %j to %s', (status, code, kind) => {
      expect(classifyImageGenerationError({status, code})).toBe(kind);
    });
  });

  describe('typed errors never leak the raw server message', () => {
    it('classifies image_quota_reached as quota_exhausted', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            code: 'image_quota_reached',
            message: 'Batas gambar sudah tercapai.',
          },
        }),
        headers: {get: () => null},
      } as any);

      const error = await generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
      }).catch(e => e);

      expect(error).toBeInstanceOf(BotConnectorImageError);
      expect(error.kind).toBe('quota_exhausted');
      expect(error.message).not.toContain('Batas gambar');
    });

    it('classifies image_plan_required as plan_required', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {code: 'image_plan_required', message: 'Upgrade needed.'},
        }),
        headers: {get: () => null},
      } as any);

      const error = await generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
      }).catch(e => e);

      expect(error).toBeInstanceOf(BotConnectorImageError);
      expect(error.kind).toBe('plan_required');
      expect(error.message).not.toContain('Upgrade');
    });

    it('reads the code from the wrapped {error:{code}} payload', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'free_daily_budget_exhausted',
            message: 'Daily budget gone.',
          },
        }),
        headers: {get: () => null},
      } as any);

      const error = await generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
      }).catch(e => e);

      expect(error.kind).toBe('quota_exhausted');
    });

    it('maps 429 to rate_limited with Retry-After seconds', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({error: {message: 'slow down'}}),
        headers: {
          get: (name: string) => (name === 'Retry-After' ? '42' : null),
        },
      } as any);

      const error = await generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
      }).catch(e => e);

      expect(error).toBeInstanceOf(BotConnectorImageError);
      expect(error.kind).toBe('rate_limited');
      expect(error.retryAfterSeconds).toBe(42);
      expect(error.message).not.toContain('slow down');
    });

    it('maps 401 to unauthorized', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
        headers: {get: () => null},
      } as any);

      const error = await generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
      }).catch(e => e);

      expect(error).toBeInstanceOf(BotConnectorImageError);
      expect(error.kind).toBe('unauthorized');
    });

    it('maps a 402 without a code to balance_required', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 402,
        json: async () => ({}),
        headers: {get: () => null},
      } as any);

      const error = await generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
      }).catch(e => e);

      expect(error).toBeInstanceOf(BotConnectorImageError);
      expect(error.kind).toBe('balance_required');
    });
  });

  describe('cancellation', () => {
    it('rejects with kind aborted when the caller aborts the signal', async () => {
      const controller = new AbortController();
      global.fetch = jest.fn().mockImplementation(
        (_url: string, init: {signal: AbortSignal}) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(abortError()));
          }),
      );

      const pending = generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
        signal: controller.signal,
      }).catch(e => e);

      controller.abort();
      const error = await pending;

      expect(error).toBeInstanceOf(BotConnectorImageError);
      expect(error.kind).toBe('aborted');
    });

    it('rejects with kind timeout after 240 seconds', async () => {
      jest.useFakeTimers();
      global.fetch = jest.fn().mockImplementation(
        (_url: string, init: {signal: AbortSignal}) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(abortError()));
          }),
      );

      const pending = generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
      }).catch(e => e);

      jest.advanceTimersByTime(240_000);
      const error = await pending;

      expect(error).toBeInstanceOf(BotConnectorImageError);
      expect(error.kind).toBe('timeout');
    });
  });
});
