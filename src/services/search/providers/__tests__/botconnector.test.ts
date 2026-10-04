import {BotConnectorSearchProvider} from '../botconnector';
import type {SearchProvider} from '../../types';

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: {get: jest.fn().mockReturnValue(null)},
    text: () => Promise.resolve(JSON.stringify(body)),
  });

const failJson = (status: number) =>
  Promise.resolve({
    ok: false,
    status,
    headers: {get: jest.fn().mockReturnValue(null)},
    text: () => Promise.resolve(JSON.stringify({error: {message: 'failed'}})),
  });

describe('BotConnectorSearchProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  const create = (fallback?: SearchProvider, readFallback = jest.fn()) =>
    new BotConnectorSearchProvider({
      getConnection: async () => ({
        baseUrl: 'https://api.botconnector.id',
        apiKey: 'bc_live_test',
      }),
      getFallback: () => fallback,
      readFallback,
    });

  it('uses the BotConnector web-search route with the same API key', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({
        results: [
          {
            title: 'BotConnector result',
            url: 'https://example.com/a',
            snippet: 'Current result',
          },
        ],
      }),
    );

    const hits = await create().search('latest model', {maxResults: 4});

    expect(hits).toEqual([
      {
        title: 'BotConnector result',
        url: 'https://example.com/a',
        snippet: 'Current result',
      },
    ]);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.botconnector.id/v1/web/search');
    expect(init.headers.Authorization).toBe('Bearer bc_live_test');
    expect(JSON.parse(init.body)).toEqual({
      query: 'latest model',
      max_results: 4,
    });
  });

  it('falls back to the configured built-in provider when BotConnector search is unavailable', async () => {
    (global.fetch as jest.Mock).mockReturnValue(failJson(503));
    const fallback: SearchProvider = {
      id: 'brave',
      search: jest.fn().mockResolvedValue([
        {
          title: 'Fallback',
          url: 'https://fallback.example',
          snippet: 'From Brave',
        },
      ]),
    };

    const hits = await create(fallback).search('q', {maxResults: 3});

    expect(fallback.search).toHaveBeenCalledWith('q', {maxResults: 3});
    expect(hits[0].title).toBe('Fallback');
  });

  it('uses BotConnector web-fetch for read_url', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({
        url: 'https://example.com/page',
        title: 'Page',
        text: 'Full readable page content.',
      }),
    );

    const page = await create().read('https://example.com/page');

    expect(page).toEqual({
      url: 'https://example.com/page',
      title: 'Page',
      text: 'Full readable page content.',
    });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.botconnector.id/v1/web/fetch');
    expect(init.headers.Authorization).toBe('Bearer bc_live_test');
  });

  it('falls back to the default reader when the configured provider has no native read', async () => {
    (global.fetch as jest.Mock).mockReturnValue(failJson(502));
    const fallback: SearchProvider = {
      id: 'brave',
      search: jest.fn(),
    };
    const readFallback = jest.fn().mockResolvedValue({
      url: 'https://example.com',
      text: 'Jina fallback',
    });

    const page = await create(fallback, readFallback).read(
      'https://example.com',
    );

    expect(readFallback).toHaveBeenCalledWith('https://example.com');
    expect(page.text).toBe('Jina fallback');
  });

  it('does not fall back silently when no fallback provider is configured', async () => {
    (global.fetch as jest.Mock).mockReturnValue(failJson(503));

    await expect(create().search('q', {maxResults: 2})).rejects.toThrow(
      /request failed \(503\)/i,
    );
  });
});
