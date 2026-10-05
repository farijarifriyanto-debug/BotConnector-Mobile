export const BOTCONNECTOR_NAME = 'BotConnector';
export const BOTCONNECTOR_API_BASE_URL = 'https://api.botconnector.id';

/**
 * BotConnector Cloud can legitimately wait well over 30 s before the first byte:
 * reasoning models answering after a tool call, Responses-backed models that
 * deliver the full answer at once, and capacity queues. The generic 30 s
 * connection timeout surfaced as "Connection timed out" in tool loops, so the
 * official server gets a longer default (a per-server override still wins).
 */
export const BOTCONNECTOR_REQUEST_TIMEOUT_MS = 180_000;

export const isBotConnectorApiUrl = (raw: string): boolean => {
  try {
    const parsed = new URL(raw);
    return (
      parsed.protocol === 'https:' && parsed.hostname === 'api.botconnector.id'
    );
  } catch {
    return false;
  }
};
