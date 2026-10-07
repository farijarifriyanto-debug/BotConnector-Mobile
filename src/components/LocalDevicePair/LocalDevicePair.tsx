import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {botConnectorAuthStore} from '../../store';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {
  ClientDeviceError,
  listClientDevices,
  pairClientDevice,
  requestClientDevice,
  revokeClientDevice,
  type ClientDevice,
} from '../../api/clientDevices';
import {resolveDeviceStatus, type DeviceStatus} from './deviceStatus';

type L10n = React.ContextType<typeof L10nContext>;

function deviceErrorText(l10n: L10n, error: ClientDeviceError): string {
  switch (error.kind) {
    case 'device_offline':
      return l10n.settings.deviceErrorOffline;
    case 'relay_unavailable':
      return l10n.settings.deviceErrorRelayUnavailable;
    case 'device_timeout':
      return l10n.settings.deviceErrorTimeout;
    case 'method_not_allowed':
      return l10n.settings.deviceErrorMethodNotAllowed;
    case 'requires_app_login':
      return l10n.settings.deviceErrorRequiresLogin;
    case 'rate_limited':
      return t(l10n.settings.localPairRateLimited, {
        seconds: error.retryAfterSeconds ?? 60,
      });
    default:
      return l10n.settings.deviceErrorGeneric;
  }
}

function statusLabelFor(l10n: L10n, status: DeviceStatus): string {
  switch (status) {
    case 'online':
      return l10n.settings.deviceStatusOnline;
    case 'reconnecting':
      return l10n.settings.deviceStatusReconnecting;
    case 'paired':
      return l10n.settings.deviceStatusPaired;
    default:
      return l10n.settings.deviceStatusOffline;
  }
}

/** models.list payload → display names (display only; never ModelStore). */
function modelNamesFrom(payload: unknown): string[] {
  const body = payload as any;
  const list = Array.isArray(body)
    ? body
    : (body?.data ?? body?.models ?? body?.items);
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((entry: any) =>
      typeof entry === 'string' ? entry : (entry?.id ?? entry?.name),
    )
    .filter((name: unknown): name is string => typeof name === 'string');
}

function hardwareEntries(payload: unknown): Array<[string, string]> {
  const hardware =
    payload && typeof payload === 'object' && 'hardware' in (payload as any)
      ? (payload as any).hardware
      : payload;
  if (!hardware || typeof hardware !== 'object') {
    return [];
  }
  return Object.entries(hardware as Record<string, unknown>).map(
    ([key, value]) => [
      key,
      typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value),
    ],
  );
}

const asClientDeviceError = (error: unknown): ClientDeviceError =>
  error instanceof ClientDeviceError
    ? error
    : new ClientDeviceError(
        'server',
        error instanceof Error ? error.message : String(error),
      );

/**
 * §2 (BotConnector Local) pairing block: native-login gate, pair-code minting
 * with 5-minute countdown + Retry-After backoff, device list with the four
 * contract status labels, and display-only row actions (hardware.get,
 * models.list, revoke with confirmation). Intentionally NOT wired: chat stream
 * into the chat pipeline, model.load/unload into ModelStore, and no
 * install/pull/delete of any kind.
 */
export const LocalDevicePair: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const signedIn = botConnectorAuthStore.isSignedIn;

  const [now, setNow] = useState(() => Date.now());
  const [devices, setDevices] = useState<ClientDevice[] | null>(null);
  const [wasOnline, setWasOnline] = useState<Record<string, boolean>>({});
  const [justPairedIds, setJustPairedIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<ClientDeviceError | null>(null);
  const [pairCode, setPairCode] = useState<{
    code: string;
    expiresAt: number;
  } | null>(null);
  const [pairError, setPairError] = useState<ClientDeviceError | null>(null);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [detailsById, setDetailsById] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [modelsById, setModelsById] = useState<Record<string, string[]>>({});

  // Ids known when the pairing code was minted: anything first seen after the
  // mint reads "Paired" for one refresh cycle (see deviceStatus.ts).
  const baselineRef = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await listClientDevices();
      const newIds: string[] = [];
      if (baselineRef.current) {
        for (const device of list.data) {
          if (!baselineRef.current.has(device.id)) {
            newIds.push(device.id);
          }
        }
        baselineRef.current = new Set(list.data.map(device => device.id));
      }
      setJustPairedIds(newIds);
      setDevices(list.data);
      setWasOnline(previous => {
        const next = {...previous};
        for (const device of list.data) {
          next[device.id] = device.online;
        }
        return next;
      });
      setListError(null);
    } catch (error) {
      setListError(asClientDeviceError(error));
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Auto-load (and reload on sign-in) — errors surface as a typed row, never
  // as an API-key fallback (the module refuses to send keys).
  useEffect(() => {
    if (!signedIn) {
      return;
    }
    refresh();
  }, [signedIn, refresh]);

  // One-second tick drives the code countdown and the rate-limit backoff.
  useEffect(() => {
    if (!signedIn) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [signedIn]);

  const handlePair = useCallback(async () => {
    setPairError(null);
    try {
      const result = await pairClientDevice();
      baselineRef.current = new Set((devices ?? []).map(device => device.id));
      setPairCode(result);
      setNow(Date.now());
    } catch (error) {
      const typed = asClientDeviceError(error);
      setPairError(typed);
      if (typed.kind === 'rate_limited') {
        setRetryUntil(Date.now() + (typed.retryAfterSeconds ?? 60) * 1000);
      }
    }
  }, [devices]);

  const handleRevoke = useCallback(
    (device: ClientDevice) => {
      Alert.alert(
        l10n.settings.deviceRevoke,
        l10n.settings.deviceRevokeConfirm,
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: l10n.settings.deviceRevoke,
            style: 'destructive',
            onPress: () => {
              revokeClientDevice({deviceId: device.id})
                .catch(error => setListError(asClientDeviceError(error)))
                .finally(() => refresh());
            },
          },
        ],
      );
    },
    [l10n, refresh],
  );

  const handleHardware = useCallback(
    async (deviceId: string) => {
      if (detailsById[deviceId]) {
        setDetailsById(previous => {
          const next = {...previous};
          delete next[deviceId];
          return next;
        });
        return;
      }
      try {
        const payload = await requestClientDevice({
          deviceId,
          method: 'hardware.get',
          params: {},
        });
        setDetailsById(previous => ({...previous, [deviceId]: payload ?? {}}));
        setListError(null);
      } catch (error) {
        setListError(asClientDeviceError(error));
      }
    },
    [detailsById],
  );

  const handleModels = useCallback(
    async (deviceId: string) => {
      if (modelsById[deviceId]) {
        setModelsById(previous => {
          const next = {...previous};
          delete next[deviceId];
          return next;
        });
        return;
      }
      try {
        const payload = await requestClientDevice({
          deviceId,
          method: 'models.list',
          params: {},
        });
        setModelsById(previous => ({
          ...previous,
          [deviceId]: modelNamesFrom(payload),
        }));
        setListError(null);
      } catch (error) {
        setListError(asClientDeviceError(error));
      }
    },
    [modelsById],
  );

  const blocked = retryUntil !== null && now < retryUntil;
  const remainingSeconds = pairCode
    ? Math.max(0, Math.ceil((pairCode.expiresAt - now) / 1000))
    : 0;

  if (!signedIn) {
    return (
      <View testID="local-device-pair" style={styles.container}>
        <Text variant="titleSmall">{l10n.settings.localPairTitle}</Text>
        <Text variant="bodySmall" style={styles.muted}>
          {l10n.settings.deviceRequiresLogin}
        </Text>
        <Button
          testID="local-device-signin"
          mode="contained-tonal"
          compact
          onPress={() => {
            botConnectorAuthStore.startLogin().catch(() => undefined);
          }}>
          {l10n.settings.localPairSignIn}
        </Button>
      </View>
    );
  }

  return (
    <View testID="local-device-pair" style={styles.container}>
      <Text variant="titleSmall">{l10n.settings.localPairTitle}</Text>

      <Button
        testID="local-device-pair-cta"
        mode="contained-tonal"
        compact
        disabled={blocked}
        accessibilityLabel={l10n.settings.localPairCta}
        onPress={() => {
          handlePair().catch(() => undefined);
        }}>
        {l10n.settings.localPairCta}
      </Button>

      {pairCode && remainingSeconds > 0 ? (
        <View style={styles.codeBox}>
          <Text
            testID="local-device-pair-code"
            accessibilityLabel={pairCode.code}
            variant="headlineSmall"
            style={styles.code}>
            {pairCode.code}
          </Text>
          <Text variant="bodySmall">
            {t(l10n.settings.localPairExpires, {seconds: remainingSeconds})}
          </Text>
          <Text variant="bodySmall" style={styles.muted}>
            {l10n.settings.localPairCodeHint}
          </Text>
        </View>
      ) : null}

      {pairError ? (
        <Text testID="local-device-pair-error" style={styles.error}>
          {deviceErrorText(l10n, pairError)}
        </Text>
      ) : null}

      {listError ? (
        <Text testID="local-device-error" style={styles.error}>
          {deviceErrorText(l10n, listError)}
        </Text>
      ) : null}

      <View style={styles.listHeader}>
        <Button
          testID="local-device-refresh"
          mode="text"
          compact
          loading={refreshing}
          onPress={() => {
            refresh().catch(() => undefined);
          }}>
          {l10n.settings.deviceRefresh}
        </Button>
      </View>

      {devices && devices.length === 0 ? (
        <Text variant="bodySmall" style={styles.muted}>
          {l10n.settings.deviceListEmpty}
        </Text>
      ) : null}

      {devices?.map(device => {
        const status = resolveDeviceStatus(device, {
          refreshing,
          wasOnline: wasOnline[device.id] ?? false,
          justPaired: justPairedIds.includes(device.id),
        });
        const details = detailsById[device.id];
        const modelNames = modelsById[device.id];
        return (
          <View
            key={device.id}
            testID={`local-device-row-${device.id}`}
            style={styles.row}>
            <View style={styles.rowMain}>
              <Text
                variant="bodyMedium"
                numberOfLines={1}
                style={styles.rowName}>
                {device.name}
              </Text>
              <Text
                testID={`local-device-status-${device.id}`}
                variant="labelSmall"
                style={styles.status}>
                {statusLabelFor(l10n, status)}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <Button
                testID={`local-device-hardware-${device.id}`}
                mode="text"
                compact
                onPress={() => {
                  handleHardware(device.id).catch(() => undefined);
                }}>
                {l10n.settings.deviceShowDetails}
              </Button>
              <Button
                testID={`local-device-models-${device.id}`}
                mode="text"
                compact
                onPress={() => {
                  handleModels(device.id).catch(() => undefined);
                }}>
                {l10n.settings.deviceFetchModels}
              </Button>
              <Button
                testID={`local-device-revoke-${device.id}`}
                mode="text"
                compact
                textColor={theme.colors.error}
                onPress={() => handleRevoke(device)}>
                {l10n.settings.deviceRevoke}
              </Button>
            </View>
            {details ? (
              <View style={styles.detailBox}>
                {hardwareEntries(details).map(([key, value]) => (
                  <Text key={key} variant="bodySmall" style={styles.muted}>
                    {key}: {value}
                  </Text>
                ))}
              </View>
            ) : null}
            {modelNames ? (
              <View style={styles.detailBox}>
                {modelNames.map(name => (
                  <Text key={name} variant="bodySmall">
                    {name}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128, 128, 128, 0.35)',
    borderRadius: 12,
    padding: 12,
  },
  muted: {
    opacity: 0.75,
  },
  error: {
    color: '#B3261E',
  },
  codeBox: {
    gap: 4,
    alignItems: 'center',
    paddingVertical: 6,
  },
  code: {
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  row: {
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128, 128, 128, 0.25)',
    paddingTop: 6,
  },
  rowMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rowName: {
    flexShrink: 1,
  },
  status: {
    opacity: 0.8,
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  detailBox: {
    gap: 2,
  },
});
