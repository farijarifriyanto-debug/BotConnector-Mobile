import {BotConnectorClientCapabilities} from '../api/botconnectorAccess';
import type {BotConnectorCapabilityErrorKind} from '../api/botconnectorAccess';

export type CapabilityAxis = Exclude<
  keyof BotConnectorClientCapabilities['capabilities'],
  'chat'
>;

export type CapabilityDenialReason =
  | 'signed_out'
  | 'checking'
  | 'unavailable'
  | 'quota_rate_limited'
  | 'quota_balance'
  | 'model_unsupported'
  | 'plan_not_included';

export interface CapabilityDenialInput {
  /** Final resolved availability for this axis (already merges model + account). */
  enabled: boolean;
  /** True when the active server is the official BotConnector API. */
  isBotConnectorServer: boolean;
  isSignedIn: boolean;
  access?: BotConnectorClientCapabilities;
  accessLoading?: boolean;
  accessError?: boolean;
  /**
   * Why the last capability check failed: 429/402 are quota refusals with
   * their own message, anything else is a backend failure.
   */
  accessErrorKind?: BotConnectorCapabilityErrorKind;
  /** Whether the active model itself supports the axis (e.g. Vision). */
  modelSupports: boolean;
  capability: CapabilityAxis;
}

/**
 * Explain WHY a capability is unavailable so the UI can show an accurate
 * ladder — sign in → checking → capability service unavailable → model
 * unsupported → plan does not include it — instead of blaming the model for
 * every failure. Returns null when the capability is available.
 */
export function resolveCapabilityDenial(
  input: CapabilityDenialInput,
): CapabilityDenialReason | null {
  if (input.enabled) {
    return null;
  }
  if (!input.modelSupports) {
    return 'model_unsupported';
  }
  if (!input.isBotConnectorServer) {
    // Non-official servers keep the legacy "model cannot …" explanation;
    // there is no BotConnector account axis to blame.
    return 'model_unsupported';
  }
  if (!input.isSignedIn) {
    return 'signed_out';
  }
  if (input.accessLoading) {
    return 'checking';
  }
  if (input.accessError) {
    // Quota refusals (429 rate limit / 402 balance) are their own answer —
    // they are not "backend down", and never the model's fault.
    if (input.accessErrorKind === 'quota_rate_limited') {
      return 'quota_rate_limited';
    }
    if (input.accessErrorKind === 'quota_balance') {
      return 'quota_balance';
    }
    // The check itself failed (network/backend): never blame the plan, and
    // don't claim to still be checking — offer a retry instead.
    return 'unavailable';
  }
  if (!input.access) {
    return 'checking';
  }
  if (input.access.plan === 'unknown') {
    return 'unavailable';
  }
  if (input.access.capabilities[input.capability] !== true) {
    return 'plan_not_included';
  }
  return null;
}
