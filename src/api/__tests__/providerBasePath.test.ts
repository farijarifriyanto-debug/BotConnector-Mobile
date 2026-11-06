import {fetchModelsWithHeaders} from '../openai';
import {versionedBaseUrl} from '../http';
import {BYOK_PROVIDERS} from '../byokProviders';

/**
 * Every preset's base URL carries its own version segment
 * (openrouter.ai/api/v1, api.deepseek.com/v1, ...). Appending a hardcoded /v1
 * on top of it produced /v1/v1/models and a 404 for six of the eight presets.
 * The chat URLs for the same bases are pinned in openai.test.ts and
 * anthropic.test.ts, next to their streaming mocks.
 */

const mockHeaders = () => ({
  forEach: (cb: (v: string, k: string) => void) => cb('', ''),
});

const modelsUrl = async (url: string) => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    headers: mockHeaders(),
    json: () => Promise.resolve({data: []}),
  });
  await fetchModelsWithHeaders(url);
  return (global.fetch as jest.Mock).mock.calls[0][0];
};

describe('provider base paths (models request)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not double the version segment', async () => {
    expect(await modelsUrl('https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1/models',
    );
    expect(await modelsUrl('https://api.deepseek.com/v1')).toBe(
      'https://api.deepseek.com/v1/models',
    );
    expect(
      await modelsUrl(
        'https://generativelanguage.googleapis.com/v1beta/openai',
      ),
    ).toBe('https://generativelanguage.googleapis.com/v1beta/openai/models');
  });

  it('appends /v1 to a bare host, like a manual local server', async () => {
    expect(await modelsUrl('http://localhost:1234')).toBe(
      'http://localhost:1234/v1/models',
    );
    expect(await modelsUrl('https://api.botconnector.id')).toBe(
      'https://api.botconnector.id/v1/models',
    );
  });
});

describe('every preset produces exactly one version segment', () => {
  // The bridge stores meta.defaultBaseUrl verbatim as the server URL, so the
  // chat path is derived from it. A preset whose base already carries a
  // version must not gain a second one.
  it.each(
    BYOK_PROVIDERS.filter(
      meta => meta.defaultBaseUrl && meta.transport === 'openai',
    ).map(meta => [meta.id, meta.defaultBaseUrl] as const),
  )('%s', (_id, base) => {
    const chatUrl = `${versionedBaseUrl(base)}/chat/completions`;
    const versions = chatUrl.match(/\/v\d+/g) ?? [];
    expect(versions).toHaveLength(1);
    expect(chatUrl).not.toMatch(/\/v\d+\/v\d+/i);
  });

  it('keeps a custom versioned endpoint as typed', () => {
    expect(versionedBaseUrl('https://api.example.com/v2')).toBe(
      'https://api.example.com/v2',
    );
    expect(versionedBaseUrl('https://api.example.com')).toBe(
      'https://api.example.com/v1',
    );
  });
});
