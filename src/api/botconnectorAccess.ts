import {
  buildHeaders,
  CONNECTION_TIMEOUT_MS,
  normalizeUrl,
  resolveTimeout,
} from './http';

export type BotConnectorClientAccess = 'chat_only' | 'full';

export interface BotConnectorClientCapabilities {
  object: 'botconnector.client_capabilities';
  plan: string;
  access: BotConnectorClientAccess;
  paid: boolean;
  entitlement_sources: {
    subscription: boolean;
    payg: boolean;
    family: boolean;
  };
  capabilities: {
    chat: true;
    web_search: boolean;
    read_url: boolean;
    tools: boolean;
    vision: boolean;
    media: boolean;
    /** Present only when the BotConnector Files backend is available. */
    files?: boolean;
  };
}

export function chatOnlyBotConnectorCapabilities(
  plan = 'unknown',
): BotConnectorClientCapabilities {
  return {
    object: 'botconnector.client_capabilities',
    plan,
    access: 'chat_only',
    paid: false,
    entitlement_sources: {
      subscription: false,
      payg: false,
      family: false,
    },
    capabilities: {
      chat: true,
      web_search: false,
      read_url: false,
      tools: false,
      vision: false,
      media: false,
      files: false,
    },
  };
}

export async function fetchBotConnectorClientCapabilities(
  serverUrl: string,
  apiKey: string,
  timeoutMs?: number,
): Promise<BotConnectorClientCapabilities> {
  if (!apiKey.trim()) {
    throw new Error('BotConnector API key is required');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    resolveTimeout(timeoutMs, CONNECTION_TIMEOUT_MS),
  );

  try {
    const response = await fetch(
      `${normalizeUrl(serverUrl)}/v1/client/capabilities`,
      {
        method: 'GET',
        headers: buildHeaders(apiKey),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(
        `BotConnector capabilities request failed (${response.status})`,
      );
    }

    const payload = await response.json();
    if (
      payload?.object !== 'botconnector.client_capabilities' ||
      (payload?.access !== 'chat_only' && payload?.access !== 'full') ||
      payload?.capabilities?.chat !== true
    ) {
      throw new Error('Invalid BotConnector capabilities response');
    }

    return payload as BotConnectorClientCapabilities;
  } finally {
    clearTimeout(timeout);
  }
}
