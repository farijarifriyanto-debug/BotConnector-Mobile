import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {botConnectorAuthStore} from '../../store';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

type Props = {
  compact?: boolean;
};

export const BotConnectorAccountCard: React.FC<Props> = observer(
  ({compact = false}) => {
    const theme = useTheme();
    const l10n = React.useContext(L10nContext);
    const account = botConnectorAuthStore.account;
    const signedIn = botConnectorAuthStore.isSignedIn;
    const displayName = account?.display_name?.trim() || '';
    const email = account?.email?.trim() || '';
    const plan = account?.plan?.trim() || '';

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

        <Button
          testID="botconnector-account-action"
          compact
          mode={signedIn ? 'text' : 'contained-tonal'}
          loading={botConnectorAuthStore.isSigningIn}
          disabled={botConnectorAuthStore.isSigningIn}
          style={!compact ? styles.regularAction : undefined}
          onPress={() => {
            const action = signedIn
              ? botConnectorAuthStore.logout()
              : botConnectorAuthStore.startLogin();
            action.catch(() => undefined);
          }}>
          {signedIn
            ? l10n.palsScreen.signOut
            : l10n.settings.connectBotConnector}
        </Button>
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
