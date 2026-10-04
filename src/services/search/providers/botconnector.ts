import type {
  PageContent,
  SearchHit,
  SearchOptions,
  SearchProvider,
} from '../types';
import {fetchJson, requireKey} from './http';

const SEARCH_TIMEOUT_MS = 27000;
const FETCH_TIMEOUT_MS = 32000;

export interface BotConnectorSearchConnection {
  baseUrl: string;
  apiKey?: string;
}

interface BotConnectorSearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    description?: string;
    publishedAt?: string;
    published_at?: string;
  }>;
}

interface BotConnectorFetchResponse {
  url?: string;
  title?: string;
  text?: string;
  content?: string;
  markdown?: string;
  body?: string;
}

interface BotConnectorSearchProviderOptions {
  getConnection(): Promise<BotConnectorSearchConnection | undefined>;
  getFallback(): SearchProvider | undefined;
  readFallback(url: string): Promise<PageContent>;
}

const apiRoot = (raw: string): string => {
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed;
};

const isHttpUrl = (raw: string): boolean => {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export class BotConnectorSearchProvider implements SearchProvider {
  readonly id = 'botconnector' as const;

  constructor(private options: BotConnectorSearchProviderOptions) {}

  private async connection(): Promise<{
    baseUrl: string;
    apiKey: string;
  }> {
    const connection = await this.options.getConnection();
    if (!connection) {
      throw new Error('BotConnector connection is not available');
    }
    return {
      baseUrl: apiRoot(connection.baseUrl),
      apiKey: requireKey(connection.apiKey ?? '', 'BotConnector'),
    };
  }

  private async primarySearch(
    query: string,
    opts: SearchOptions,
  ): Promise<SearchHit[]> {
    const {baseUrl, apiKey} = await this.connection();
    const data = await fetchJson<BotConnectorSearchResponse>(
      `${baseUrl}/v1/web/search`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          max_results: opts.maxResults,
        }),
      },
      SEARCH_TIMEOUT_MS,
    );

    return (data.results ?? [])
      .filter(result => typeof result.url === 'string' && isHttpUrl(result.url))
      .map(result => ({
        title: result.title ?? result.url ?? '',
        url: result.url ?? '',
        snippet: result.snippet ?? result.description ?? '',
        ...((result.publishedAt ?? result.published_at)
          ? {publishedAt: result.publishedAt ?? result.published_at}
          : {}),
      }));
  }

  async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    try {
      return await this.primarySearch(query, opts);
    } catch (primaryError) {
      const fallback = this.options.getFallback();
      if (!fallback) {
        throw primaryError;
      }
      if (__DEV__) {
        console.warn(
          '[web_search] BotConnector unavailable; using configured fallback',
          primaryError,
        );
      }
      return fallback.search(query, opts);
    }
  }

  private async primaryRead(url: string): Promise<PageContent> {
    const {baseUrl, apiKey} = await this.connection();
    const data = await fetchJson<BotConnectorFetchResponse>(
      `${baseUrl}/v1/web/fetch`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({url}),
      },
      FETCH_TIMEOUT_MS,
    );

    const text = data.text ?? data.content ?? data.markdown ?? data.body ?? '';
    if (!text.trim()) {
      throw new Error('BotConnector returned no readable page content');
    }
    return {
      url: data.url && isHttpUrl(data.url) ? data.url : url,
      ...(data.title ? {title: data.title} : {}),
      text,
    };
  }

  async read(url: string): Promise<PageContent> {
    try {
      return await this.primaryRead(url);
    } catch (primaryError) {
      const fallback = this.options.getFallback();
      if (fallback?.read) {
        if (__DEV__) {
          console.warn(
            '[read_url] BotConnector unavailable; using configured fallback',
            primaryError,
          );
        }
        return fallback.read(url);
      }
      if (fallback) {
        if (__DEV__) {
          console.warn(
            '[read_url] BotConnector unavailable; using default reader',
            primaryError,
          );
        }
        return this.options.readFallback(url);
      }
      throw primaryError;
    }
  }
}
