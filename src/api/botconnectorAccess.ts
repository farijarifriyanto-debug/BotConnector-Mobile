import {
  buildHeaders,
  CONNECTION_TIMEOUT_MS,
  normalizeUrl,
  resolveTimeout,
} from './http';

export type BotConnectorClientAccess = 'chat_only' | 'full';

/** Server-provided PAYG balance state (capabilities payload). */
export interface BotConnectorPaygInfo {
  state: 'unavailable' | 'zero' | 'active';
  available_micros?: number;
}

export interface BotConnectorClientCapabilities {
  object: 'botconnector.client_capabilities';
  plan: string;
  /** Legacy compatibility flag. Never use it for UI gating — read `capabilities` per axis. */
  access?: BotConnectorClientAccess;
  /** Legacy compatibility flag. Never use it for UI gating. */
  paid?: boolean;
  entitlement_sources?: {
    subscription: boolean;
    payg: boolean;
    family: boolean;
  };
  /** Per-axis entitlement reasons, e.g. `reasons.files = "paid_plan_required"`. */
  reasons?: Record<string, string>;
  /** What limits the reported capabilities: quota, model, or plan. */
  capability_scope?: 'quota' | 'model' | 'plan';
  /** PAYG balance straight from the server; UI derives unavailable/zero/active from `state`. */
  payg?: BotConnectorPaygInfo;
  capabilities: {
    chat: boolean;
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

/**
 * Capability fetch failure classified so the UI can separate "quota limited
 * (429/402)" from "backend unreachable" instead of blaming the model.
 */
export type BotConnectorCapabilityErrorKind =
  | 'quota_rate_limited'
  | 'quota_balance'
  | 'server';

export class BotConnectorCapabilityError extends Error {
  readonly kind: BotConnectorCapabilityErrorKind;
  readonly statusCode?: number;

  constructor(
    kind: BotConnectorCapabilityErrorKind,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'BotConnectorCapabilityError';
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

const capabilityErrorKindForStatus = (
  status: number,
): BotConnectorCapabilityErrorKind => {
  if (status === 429) {
    return 'quota_rate_limited';
  }
  if (status === 402) {
    return 'quota_balance';
  }
  return 'server';
};

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
      const kind = capabilityErrorKindForStatus(response.status);
      throw new BotConnectorCapabilityError(
        kind,
        `BotConnector capabilities request failed (${response.status})`,
        response.status,
      );
    }

    const payload = await response.json();
    // `access`/`paid` are legacy compatibility fields and may disappear;
    // gating reads the independent per-axis `capabilities` instead.
    if (
      payload?.object !== 'botconnector.client_capabilities' ||
      typeof payload?.capabilities !== 'object' ||
      payload?.capabilities === null ||
      typeof payload?.capabilities?.chat !== 'boolean'
    ) {
      throw new Error('Invalid BotConnector capabilities response');
    }

    return payload as BotConnectorClientCapabilities;
  } finally {
    clearTimeout(timeout);
  }
}
