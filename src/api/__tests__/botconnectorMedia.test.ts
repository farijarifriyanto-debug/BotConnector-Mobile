import {
  fetchBotConnectorImageModels,
  generateBotConnectorImage,
} from '../botconnectorMedia';

describe('BotConnector media API', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
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
      expect.objectContaining({id: 'img-free', botconnector_access: 'free'}),
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

  it('generates one image and returns quota metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        created: 1,
        data: [{b64_json: 'ZmFrZS1pbWFnZQ=='}],
        botconnector: {
          mime_type: 'image/png',
          access: 'plan',
          image_quota: {remaining: 9, limit: 10, period: 'day'},
        },
      }),
    } as any);

    await expect(
      generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'a dark minimal robot',
      }),
    ).resolves.toEqual({
      b64: 'ZmFrZS1pbWFnZQ==',
      mimeType: 'image/png',
      access: 'plan',
      quotaRemaining: 9,
      quotaLimit: 10,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.botconnector.id/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'img-free',
          prompt: 'a dark minimal robot',
          n: 1,
          size: '1024x1024',
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

  it('surfaces the server error message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: {message: 'Batas gambar sudah tercapai.'},
      }),
    } as any);

    await expect(
      generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
      }),
    ).rejects.toThrow('Batas gambar sudah tercapai.');
  });

  it('explains a 429 without a server message as a rate/quota limit', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as any);

    await expect(
      generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
      }),
    ).rejects.toThrow('Rate limit reached');
  });

  it('explains a 402 without a server message as a quota/balance need', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({}),
    } as any);

    await expect(
      generateBotConnectorImage({
        serverUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
        model: 'img-free',
        prompt: 'test',
      }),
    ).rejects.toThrow('Quota or balance needed');
  });
});
