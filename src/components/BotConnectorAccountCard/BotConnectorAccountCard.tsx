import React from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {botConnectorAuthStore, serverStore} from '../../store';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {
  derivePaygBalanceFromCapabilities,
  derivePaygBalanceMicros,
  derivePaygState,
  derivePaygStateFromCapabilities,
  formatPaygBalance,
} from '../../utils/paygStatus';

type Props = {
  compact?: boolean;
  readOnly?: boolean;
};

export const BotConnectorAccountCard: React.FC<Props> = observer(
  ({compact = false, readOnly = false}) => {
    const theme = useTheme();
    const l10n = React.useContext(L10nContext);
    const account = botConnectorAuthStore.account;
    const signedIn = botConnectorAuthStore.isSignedIn;
    const accountBusy =
      botConnectorAuthStore.isSigningIn || botConnectorAuthStore.isRestoring;
    const displayName = account?.display_name?.trim() || '';
    const email = account?.email?.trim() || '';
    const plan = account?.plan?.trim() || '';

    let paygText: string | null = null;
    if (account) {
      // Contract: prefer `payg.state` from the capabilities payload (server
      // truth); fall back to the account fields only when it is absent.
      const capabilitiesPayg = serverStore.botConnectorPayg;
      const state =
        derivePaygStateFromCapabilities(capabilitiesPayg) ??
        derivePaygState(account);
      switch (state) {
        case 'active': {
          const micros =
            derivePaygBalanceFromCapabilities(capabilitiesPayg) ??
            derivePaygBalanceMicros(account);
          paygText =
            micros === null
              ? l10n.settings.paygUnknown
              : t(l10n.settings.paygActive, {
                  balance: formatPaygBalance(micros),
                });
          break;
        }
        case 'zero':
          paygText = l10n.settings.paygZero;
          break;
        case 'unknown':
          paygText = l10n.settings.paygUnknown;
          break;
        default:
          paygText = l10n.settings.paygUnavailable;
          break;
      }
    }

    return (
      <View
        testID="botconnector-account-card"
        style={[
          styles.container,
          compact && styles.compact,
          {
            backgroundColor: theme.colors.surfaceVariant,
            borderColor: theme.colors.outlineVariant,
          },
        ]}>
        <View
          style={[
            styles.identity,
            compact ? styles.compactIdentity : styles.regularIdentity,
          ]}>
          <Text
            variant={compact ? 'labelLarge' : 'titleMedium'}
            numberOfLines={1}>
            {signedIn
              ? displayName || email || l10n.settings.connected
              : l10n.settings.connectBotConnector}
          </Text>
          {signedIn ? (
            <>
              {displayName && email ? (
                <Text
                  numberOfLines={1}
                  variant="bodySmall"
                  style={{color: theme.colors.onSurfaceVariant}}>
                  {email}
                </Text>
              ) : null}
              {plan ? (
                <Text
                  variant="labelSmall"
                  style={{color: theme.colors.primary}}>
                  {plan.toUpperCase()}
                </Text>
              ) : null}
              {paygText ? (
                <Text
                  testID="botconnector-account-payg"
                  variant="labelSmall"
                  style={{color: theme.colors.onSurfaceVariant}}>
                  {paygText}
                </Text>
              ) : null}
            </>
          ) : (
            <Text
              variant="bodySmall"
              style={{color: theme.colors.onSurfaceVariant}}>
              {l10n.settings.connectBotConnectorDescription}
            </Text>
          )}
          {botConnectorAuthStore.error ? (
            <Text variant="bodySmall" style={{color: theme.colors.error}}>
              {botConnectorAuthStore.error}
            </Text>
          ) : null}
        </View>

        {readOnly ? (
          signedIn ? null : (
            <Text
              testID="botconnector-account-manage-hint"
              variant="bodySmall"
              style={{color: theme.colors.onSurfaceVariant}}>
              {l10n.settings.accountManageInSettings}
            </Text>
          )
        ) : (
          <Button
            testID="botconnector-account-action"
            compact
            mode={signedIn ? 'text' : 'contained-tonal'}
            loading={accountBusy}
            disabled={accountBusy}
            style={!compact ? styles.regularAction : undefined}
            onPress={() => {
              if (!signedIn) {
                botConnectorAuthStore.startLogin().catch(() => undefined);
                return;
              }
              // Sign-out drops the session: confirm first (destructive action).
              Alert.alert(
                l10n.palsScreen.signOut,
                l10n.palsScreen.signOutConfirmation,
                [
                  {text: l10n.common.cancel, style: 'cancel'},
                  {
                    text: l10n.palsScreen.signOut,
                    style: 'destructive',
                    onPress: () => {
                      botConnectorAuthStore.logout().catch(() => undefined);
                    },
                  },
                ],
              );
            }}>
            {signedIn
              ? l10n.palsScreen.signOut
              : l10n.settings.connectBotConnector}
          </Button>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  compact: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  identity: {
    minWidth: 0,
    gap: 2,
  },
  regularIdentity: {
    width: '100%',
  },
  compactIdentity: {
    flex: 1,
  },
  regularAction: {
    alignSelf: 'stretch',
  },
});
