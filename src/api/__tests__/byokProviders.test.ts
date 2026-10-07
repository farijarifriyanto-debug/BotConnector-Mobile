import {
  BYOK_PROVIDERS,
  ByokApiError,
  fetchByokModels,
  getProviderMeta,
  resolveModelsUrl,
  testByokConnection,
} from '../byokProviders';

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  json: () => Promise.resolve(body),
});

describe('BYOK provider metadata', () => {
  it('exposes six providers with official base URLs', () => {
    expect(BYOK_PROVIDERS.map(p => p.id)).toEqual([
      'openai',
      'anthropic',
      'gemini',
      'deepseek',
      'openrouter',
      'generic',
    ]);
    expect(getProviderMeta('openai').defaultBaseUrl).toBe(
      'https://api.openai.com/v1',
    );
    expect(getProviderMeta('anthropic').defaultBaseUrl).toBe(
      'https://api.anthropic.com/v1',
    );
    expect(getProviderMeta('gemini').defaultBaseUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai',
    );
    expect(getProviderMeta('deepseek').defaultBaseUrl).toBe(
      'https://api.deepseek.com/v1',
    );
    expect(getProviderMeta('openrouter').defaultBaseUrl).toBe(
      'https://openrouter.ai/api/v1',
    );
    expect(getProviderMeta('generic').requiresBaseUrl).toBe(true);
    expect(getProviderMeta('openai').requiresBaseUrl).toBe(false);
  });

  it('marks only Anthropic as native transport', () => {
    expect(getProviderMeta('anthropic').transport).toBe('anthropic');
    expect(getProviderMeta('openai').transport).toBe('openai');
    expect(getProviderMeta('gemini').transport).toBe('openai');
  });
});

describe('resolveModelsUrl', () => {
  it('appends /models to official bases', () => {
    expect(resolveModelsUrl(getProviderMeta('openai'))).toBe(
      'https://api.openai.com/v1/models',
    );
    expect(resolveModelsUrl(getProviderMeta('gemini'))).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/models',
    );
    expect(resolveModelsUrl(getProviderMeta('openrouter'))).toBe(
      'https://openrouter.ai/api/v1/models',
    );
  });

  it('prefers an explicit base URL and strips trailing slashes', () => {
    expect(
      resolveModelsUrl(getProviderMeta('openai'), 'https://alt.example/v1/'),
    ).toBe('https://alt.example/v1/models');
  });

  it('uses /v1/models for generic bases and avoids double versioning', () => {
    const meta = getProviderMeta('generic');
    expect(resolveModelsUrl(meta, 'https://my.server')).toBe(
      'https://my.server/v1/models',
    );
    expect(resolveModelsUrl(meta, 'https://my.server/v1')).toBe(
      'https://my.server/v1/models',
    );
    expect(resolveModelsUrl(meta, 'https://my.server/v1beta/openai')).toBe(
      'https://my.server/v1beta/openai/models',
    );
  });
});

describe('fetchByokModels', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('calls the OpenAI models endpoint with a Bearer header', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {id: 'gpt-test', object: 'model', owned_by: 'openai'},
          {id: 'other', object: 'model', owned_by: 'org'},
        ],
      }),
    );

    const models = await fetchByokModels('openai', {apiKey: 'sk-test'});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
    });
    expect(models).toEqual([
      {id: 'gpt-test', object: 'model', owned_by: 'openai'},
      {id: 'other', object: 'model', owned_by: 'org'},
    ]);
  });

  it('sends the API key only in the auth header, never in the URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({data: [{id: 'm'}]}));

    await fetchByokModels('openrouter', {apiKey: 'or-secret'});

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain('or-secret');
    expect(init.headers.Authorization).toBe('Bearer or-secret');
  });

  it('uses Anthropic native headers and maps its response shape', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [{id: 'claude-test', display_name: 'Claude Test', type: 'model'}],
        has_more: false,
        first_id: 'claude-test',
      }),
    );

    const models = await fetchByokModels('anthropic', {apiKey: 'sk-ant-test'});

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=1000');
    // Both official key formats are sent: x-api-key + anthropic-version
    // (documented Models API curl) and Authorization: Bearer (the API
    // overview's primary auth header).
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': 'sk-ant-test',
      'anthropic-version': '2023-06-01',
      Authorization: 'Bearer sk-ant-test',
    });
    expect(models).toEqual([
      {id: 'claude-test', object: 'model', owned_by: 'anthropic'},
    ]);
  });

  it('hits the Gemini OpenAI-compatible base', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({data: [{id: 'gemini-test'}]}),
    );

    await fetchByokModels('gemini', {apiKey: 'ai-test'});

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/models',
    );
  });

  it('uses a user-supplied base URL for the generic provider', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({data: [{id: 'custom-model'}]}),
    );

    await fetchByokModels('generic', {
      apiKey: 'k',
      baseUrl: 'https://my.server',
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://my.server/v1/models');
  });

  it('rejects a generic provider without a base URL', async () => {
    await expect(
      fetchByokModels('generic', {apiKey: 'k'}),
    ).rejects.toMatchObject({
      code: 'server',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an empty API key before any request', async () => {
    await expect(
      fetchByokModels('openai', {apiKey: '  '}),
    ).rejects.toMatchObject({
      code: 'invalidKey',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps 401 and 403 to invalidKey', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));

    await expect(
      fetchByokModels('openai', {apiKey: 'bad'}),
    ).rejects.toMatchObject({
      code: 'invalidKey',
      status: 401,
    });
  });

  it('maps 404 to notFound and other failures to server', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    await expect(
      fetchByokModels('generic', {apiKey: 'k', baseUrl: 'https://bad.server'}),
    ).rejects.toMatchObject({code: 'notFound', status: 404});

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(
      fetchByokModels('openai', {apiKey: 'k'}),
    ).rejects.toMatchObject({
      code: 'server',
      status: 500,
    });
  });

  it('maps transport failures to network errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Could not connect'));

    await expect(
      fetchByokModels('openai', {apiKey: 'k'}),
    ).rejects.toMatchObject({
      code: 'network',
      message: 'Could not connect',
    });
  });

  it('aborts after the timeout and reports timeout', async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: {signal: AbortSignal}) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      );

      const pending = fetchByokModels('openai', {apiKey: 'k', timeoutMs: 1000});
      jest.advanceTimersByTime(1000);
      await expect(pending).rejects.toMatchObject({
        code: 'timeout',
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('testByokConnection', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('reports success with the model count', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({data: [{id: 'a'}, {id: 'b'}, {id: 'c'}]}),
    );

    const result = await testByokConnection('openai', {apiKey: 'sk-test'});

    expect(result).toEqual({ok: true, modelCount: 3});
  });

  it('never throws, returning a typed failure instead', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));

    const result = await testByokConnection('anthropic', {apiKey: 'bad'});

    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalidKey');
    expect(result.message).toBeDefined();
  });

  it('classifies transport failures as network errors', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    const result = await testByokConnection('openrouter', {apiKey: 'k'});

    expect(result).toMatchObject({ok: false, code: 'network'});
  });

  it('keeps the API key out of result messages', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));

    const result = await testByokConnection('openai', {
      apiKey: 'sk-super-secret',
    });

    expect(JSON.stringify(result)).not.toContain('sk-super-secret');
  });
});

describe('ByokApiError', () => {
  it('carries a code and status', () => {
    const error = new ByokApiError('invalidKey', 'nope', 401);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ByokApiError');
    expect(error.code).toBe('invalidKey');
    expect(error.status).toBe(401);
  });
});
