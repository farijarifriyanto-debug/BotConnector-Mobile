export type BotConnectorPaygState =
  | 'unavailable'
  | 'unknown'
  | 'zero'
  | 'active';

type PaygAccountFields = {
  has_payg?: boolean | null;
  available_micros?: number | null;
};

export const derivePaygState = (
  account: PaygAccountFields | null | undefined,
): BotConnectorPaygState => {
  if (!account || account.has_payg !== true) {
    return 'unavailable';
  }
  const micros = account.available_micros;
  if (typeof micros !== 'number' || !Number.isFinite(micros)) {
    return 'unknown';
  }
  return micros > 0 ? 'active' : 'zero';
};

export const derivePaygBalanceMicros = (
  account: PaygAccountFields | null | undefined,
): number | null => {
  if (!account || account.has_payg !== true) {
    return null;
  }
  const micros = account.available_micros;
  return typeof micros === 'number' && Number.isFinite(micros) ? micros : null;
};

export const formatPaygBalance = (micros: number): string => {
  const usd = micros / 1_000_000;
  const decimals = usd > 0 && usd < 0.01 ? 4 : 2;
  return `$${usd.toFixed(decimals)}`;
};

/**
 * PAYG state straight from the capabilities payload (`payg.state`).
 * Returns undefined when the payload did not carry a usable state, so the
 * caller can fall back to the account fields — never invent a balance.
 */
export const derivePaygStateFromCapabilities = (
  info: {state?: unknown} | null | undefined,
): BotConnectorPaygState | undefined => {
  const state = info?.state;
  if (state === 'unavailable' || state === 'zero' || state === 'active') {
    return state;
  }
  return undefined;
};

/** Balance for an active capabilities PAYG block; null when not reported. */
export const derivePaygBalanceFromCapabilities = (
  info: {state?: unknown; available_micros?: unknown} | null | undefined,
): number | null => {
  if (!info || info.state !== 'active') {
    return null;
  }
  const micros = info.available_micros;
  return typeof micros === 'number' && Number.isFinite(micros) ? micros : null;
};
