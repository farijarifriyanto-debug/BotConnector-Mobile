import type {ClientDevice} from '../../api/clientDevices';

export type DeviceStatus = 'online' | 'offline' | 'reconnecting' | 'paired';

export interface DeviceStatusContext {
  /** A list refresh is in flight; rows still show the previous snapshot. */
  refreshing: boolean;
  /** Was this device online in the last confirmed snapshot? */
  wasOnline: boolean;
  /** First appearance after this session minted a pairing code. */
  justPaired: boolean;
}

/**
 * Status-label mapping — deliberately simple and documented, per spec:
 * 1. `justPaired` wins: a device first seen after this session minted a
 *    pairing code reads "Paired" until the next list refresh confirms it.
 * 2. While a refresh is in flight, a device that was online in the previous
 *    snapshot reads "Reconnecting"; every other row keeps/reads "Offline".
 * 3. Otherwise the server's `online` flag decides Online vs Offline.
 */
export function resolveDeviceStatus(
  device: Pick<ClientDevice, 'online'>,
  context: DeviceStatusContext,
): DeviceStatus {
  if (context.justPaired) {
    return 'paired';
  }
  if (context.refreshing) {
    return context.wasOnline ? 'reconnecting' : 'offline';
  }
  return device.online ? 'online' : 'offline';
}
