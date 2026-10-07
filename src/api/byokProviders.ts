import {
  CONNECTION_TIMEOUT_MS,
  buildHeaders,
  normalizeUrl,
  resolveTimeout,
} from './http';
import type {RemoteModelInfo} from '../utils/types';

export type ByokProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'openrouter'
  | 'generic';

export type ByokTransport = 'openai' | 'anthropic';

export interface ByokProviderMeta {
  id: ByokProviderId;
  label: string;
  transport: ByokTransport;
  defaultBaseUrl: string;
  requiresBaseUrl: boolean;
}

// Anthropic transport — verified against official docs (2026-10-07):
// (a) An official OpenAI-compatible layer exists at the SAME base URL
//     (https://api.anthropic.com/v1/, OpenAI SDK compatibility, announced
//     2026-09-22, scoped to chat completions and explicitly "not
//     production-ready"): https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk
//     Reuse it for future BYOK chat calls; it is not used for model listing.
// (b) Model listing (this flow's "Test connection") is the native Models API
//     GET https://api.anthropic.com/v1/models with anthropic-version:
//     2023-06-01 and x-api-key (limit 1..1000, default 20 — hence
//     limit=1000 below):
//     https://platform.claude.com/docs/en/api/models
//     The API overview lists Authorization: Bearer <key> as primary auth and
//     x-api-key as a supported legacy fallback, so BOTH official key formats
//     are sent:
//     https://platform.claude.com/docs/en/api/overview
export const BYOK_PROVIDERS: readonly ByokProviderMeta[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    transport: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    transport: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    transport: 'openai',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresBaseUrl: false,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    transport: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    transport: 'openai',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresBaseUrl: false,
  },
  {
    id: 'generic',
    label: 'Custom endpoint',
    transport: 'openai',
    defaultBaseUrl: '',
    requiresBaseUrl: true,
  },
];

export type ByokApiErrorCode =
  | 'invalidKey'
  | 'timeout'
  | 'network'
  | 'notFound'
  | 'server';

export class ByokApiError extends Error {
  readonly code: ByokApiErrorCode;
  readonly status?: number;

  constructor(code: ByokApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ByokApiError';
    this.code = code;
    this.status = status;
  }
}

export function getProviderMeta(id: ByokProviderId): ByokProviderMeta {
  const meta = BYOK_PROVIDERS.find(p => p.id === id);
  if (!meta) {
    throw new ByokApiError('server', `Unknown provider: ${id}`);
  }
  return meta;
}

export function resolveModelsUrl(
  meta: ByokProviderMeta,
  baseUrl?: string,
): string {
  const base = normalizeUrl((baseUrl || '').trim() || meta.defaultBaseUrl);
  if (meta.id === 'generic') {
    return /\/v\d+/i.test(base) ? `${base}/models` : `${base}/v1/models`;
  }
  return `${base}/models`;
}

function buildByokHeaders(
  meta: ByokProviderMeta,
  apiKey: string,
): Record<string, string> {
  if (meta.transport === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      Authorization: `Bearer ${apiKey}`,
    };
  }
  return buildHeaders(apiKey);
}

function parseModelsPayload(
  payload: unknown,
  transport: ByokTransport,
): RemoteModelInfo[] {
  const data = (payload as {data?: unknown} | null)?.data;
  if (!Array.isArray(data)) {
    throw new ByokApiError(
      'server',
      'Unexpected response shape from models endpoint',
    );
  }
  const models: RemoteModelInfo[] = [];
  for (const item of data as Array<Record<string, unknown>>) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      continue;
    }
    if (transport === 'anthropic') {
      models.push({id: item.id, object: 'model', owned_by: 'anthropic'});
      continue;
    }
    models.push({
      id: item.id,
      object: typeof item.object === 'string' ? item.object : 'model',
      owned_by: typeof item.owned_by === 'string' ? item.owned_by : 'unknown',
      ...(item.status
        ? {status: item.status as RemoteModelInfo['status']}
        : {}),
      ...(item.architecture
        ? {architecture: item.architecture as RemoteModelInfo['architecture']}
        : {}),
      ...(Array.isArray(item.capabilities)
        ? {capabilities: item.capabilities as string[]}
        : {}),
    });
  }
  return models;
}

export interface ByokRequestOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export async function fetchByokModels(
  providerId: ByokProviderId,
  options: ByokRequestOptions,
): Promise<RemoteModelInfo[]> {
  const meta = getProviderMeta(providerId);
  const baseUrl = (options.baseUrl || '').trim() || meta.defaultBaseUrl;
  if (!baseUrl) {
    throw new ByokApiError('server', 'Base URL is required');
  }
  const apiKey = (options.apiKey || '').trim();
  if (!apiKey) {
    throw new ByokApiError('invalidKey', 'API key is required');
  }

  let url = resolveModelsUrl(meta, baseUrl);
  if (meta.transport === 'anthropic') {
    url += '?limit=1000';
  }

  const timeoutMs = resolveTimeout(options.timeoutMs, CONNECTION_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: buildByokHeaders(meta, apiKey),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ByokApiError(
        'timeout',
        `Request timed out after ${timeoutMs}ms`,
      );
    }
    throw new ByokApiError(
      'network',
      error instanceof Error ? error.message : 'Network request failed',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const code: ByokApiErrorCode =
      response.status === 401 || response.status === 403
        ? 'invalidKey'
        : response.status === 404
          ? 'notFound'
          : 'server';
    throw new ByokApiError(
      code,
      `Models request failed with status ${response.status}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ByokApiError('server', 'Models endpoint returned invalid JSON');
  }
  return parseModelsPayload(payload, meta.transport);
}

export interface ByokTestResult {
  ok: boolean;
  modelCount?: number;
  code?: ByokApiErrorCode;
  message?: string;
}

export async function testByokConnection(
  providerId: ByokProviderId,
  options: ByokRequestOptions,
): Promise<ByokTestResult> {
  try {
    const models = await fetchByokModels(providerId, options);
    return {ok: true, modelCount: models.length};
  } catch (error) {
    if (error instanceof ByokApiError) {
      return {ok: false, code: error.code, message: error.message};
    }
    return {
      ok: false,
      code: 'network',
      message:
        error instanceof Error ? error.message : 'Network request failed',
    };
  }
}
