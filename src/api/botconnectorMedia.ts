import {buildHeaders, normalizeUrl} from './http';

export type BotConnectorMediaAccess = 'free' | 'plan' | 'payg';

export interface BotConnectorMediaModel {
  id: string;
  name: string;
  developer: string;
  category: 'image' | 'audio' | string;
  botconnector_modality: 'image' | 'audio' | string;
  botconnector_access: BotConnectorMediaAccess;
  supports_reference_images?: boolean;
  /** Sizes this model accepts (from GET /v1/media/models), e.g. ["auto","1024x1024"]. */
  botconnector_sizes?: string[];
  variants?: string[];
}

interface BotConnectorMediaModelsResponse {
  object: 'list';
  data: BotConnectorMediaModel[];
}

export interface BotConnectorImageQuota {
  tier?: string;
  remaining?: number;
  limit?: number;
  period?: string;
}

interface BotConnectorImageResponse {
  created: number;
  data: Array<{b64_json: string}>;
  botconnector?: {
    request_id?: string;
    model?: string;
    mime_type?: string;
    access?: BotConnectorMediaAccess;
    image_quota?: BotConnectorImageQuota;
  };
}

export type BotConnectorImageErrorKind =
  | 'quota_exhausted'
  | 'plan_required'
  | 'balance_required'
  | 'rate_limited'
  | 'unauthorized'
  | 'timeout'
  | 'aborted'
  | 'server';

/**
 * Typed media failure. The UI maps `kind` to a local (i18n) string — the raw
 * server message is deliberately never exposed so screens cannot render
 * untranslated server text.
 */
export class BotConnectorImageError extends Error {
  readonly kind: BotConnectorImageErrorKind;
  readonly statusCode?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    kind: BotConnectorImageErrorKind,
    options?: {statusCode?: number; retryAfterSeconds?: number},
  ) {
    super(`BotConnector image request failed (${kind})`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'BotConnectorImageError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export function classifyImageGenerationError(options: {
  status: number;
  code?: string;
}): BotConnectorImageErrorKind {
  const {status, code} = options;
  if (
    code === 'image_quota_reached' ||
    code === 'free_daily_budget_exhausted'
  ) {
    return 'quota_exhausted';
  }
  if (code === 'image_plan_required') {
    return 'plan_required';
  }
  if (code === 'payg_balance_required' || status === 402) {
    return 'balance_required';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  if (status === 401) {
    return 'unauthorized';
  }
  return 'server';
}

/** Reads `{error:{code}}` (contract) with a flat `{code}` fallback. */
function extractErrorCode(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object') {
    const body = payload as {code?: unknown; error?: {code?: unknown}};
    if (typeof body.error?.code === 'string') {
      return body.error.code;
    }
    if (typeof body.code === 'string') {
      return body.code;
    }
  }
  return undefined;
}

/** Parses a Retry-After header: delta-seconds first, HTTP-date as fallback. */
function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return undefined;
}

async function throwClassified(response: Response): Promise<never> {
  const payload = await response.json().catch(() => ({}));
  const kind = classifyImageGenerationError({
    status: response.status,
    code: extractErrorCode(payload),
  });
  const retryAfterSeconds =
    kind === 'rate_limited'
      ? parseRetryAfter(response.headers?.get?.('Retry-After'))
      : undefined;
  throw new BotConnectorImageError(kind, {
    statusCode: response.status,
    retryAfterSeconds,
  });
}

export async function fetchBotConnectorImageModels({
  serverUrl,
  apiKey,
}: {
  serverUrl: string;
  apiKey: string;
}): Promise<BotConnectorMediaModel[]> {
  const response = await fetch(`${normalizeUrl(serverUrl)}/v1/media/models`, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });
  if (!response.ok) {
    await throwClassified(response);
  }
  const payload = (await response.json()) as BotConnectorMediaModelsResponse;
  return Array.isArray(payload?.data)
    ? payload.data.filter(model => model.botconnector_modality === 'image')
    : [];
}

export const IMAGE_GENERATION_TIMEOUT_MS = 240_000;

export async function generateBotConnectorImage({
  serverUrl,
  apiKey,
  model,
  prompt,
  size = '1024x1024',
  referenceImages = [],
  signal,
  timeoutMs = IMAGE_GENERATION_TIMEOUT_MS,
}: {
  serverUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size?: string;
  referenceImages?: string[];
  /** Caller cancellation (Cancel button): rejects with kind `aborted`. */
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{
  b64: string;
  mimeType: string;
  access?: BotConnectorMediaAccess;
  quota?: BotConnectorImageQuota;
}> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onExternalAbort);
    }
  }
  try {
    const response = await fetch(
      `${normalizeUrl(serverUrl)}/v1/images/generations`,
      {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size,
          ...(referenceImages.length ? {inputs: {referenceImages}} : {}),
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      await throwClassified(response);
    }
    const payload = (await response.json()) as BotConnectorImageResponse;
    const b64 = payload?.data?.[0]?.b64_json;
    if (!b64) {
      throw new BotConnectorImageError('server');
    }
    return {
      b64,
      mimeType: payload.botconnector?.mime_type || 'image/png',
      access: payload.botconnector?.access,
      quota: payload.botconnector?.image_quota,
    };
  } catch (e) {
    if (e instanceof BotConnectorImageError) {
      throw e;
    }
    const aborted =
      controller.signal.aborted ||
      (e instanceof Error && e.name === 'AbortError');
    if (aborted) {
      throw new BotConnectorImageError(timedOut ? 'timeout' : 'aborted');
    }
    throw new BotConnectorImageError('server');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
