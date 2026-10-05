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
  variants?: string[];
}

interface BotConnectorMediaModelsResponse {
  object: 'list';
  data: BotConnectorMediaModel[];
}

interface BotConnectorImageResponse {
  created: number;
  data: Array<{b64_json: string}>;
  botconnector?: {
    request_id?: string;
    model?: string;
    mime_type?: string;
    access?: BotConnectorMediaAccess;
    image_quota?: {
      remaining?: number;
      limit?: number;
      period?: string;
      tier?: string;
    };
  };
}

const parseError = async (response: Response): Promise<string> => {
  const payload: any = await response.json().catch(() => ({}));
  return (
    payload?.error?.message ||
    payload?.detail ||
    payload?.message ||
    `BotConnector media request failed (${response.status})`
  );
};

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
    throw new Error(await parseError(response));
  }
  const payload = (await response.json()) as BotConnectorMediaModelsResponse;
  return Array.isArray(payload?.data)
    ? payload.data.filter(model => model.botconnector_modality === 'image')
    : [];
}

export async function generateBotConnectorImage({
  serverUrl,
  apiKey,
  model,
  prompt,
  size = '1024x1024',
}: {
  serverUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size?: string;
}): Promise<{
  b64: string;
  mimeType: string;
  access?: BotConnectorMediaAccess;
  quotaRemaining?: number;
  quotaLimit?: number;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(
      `${normalizeUrl(serverUrl)}/v1/images/generations`,
      {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: JSON.stringify({model, prompt, n: 1, size}),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new Error(await parseError(response));
    }
    const payload = (await response.json()) as BotConnectorImageResponse;
    const b64 = payload?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('BotConnector tidak mengembalikan data gambar.');
    }
    return {
      b64,
      mimeType: payload.botconnector?.mime_type || 'image/png',
      access: payload.botconnector?.access,
      quotaRemaining: payload.botconnector?.image_quota?.remaining,
      quotaLimit: payload.botconnector?.image_quota?.limit,
    };
  } finally {
    clearTimeout(timeout);
  }
}
