import React, {useContext, useState} from 'react';
import {Alert, View} from 'react-native';

import {Text, TextInput} from 'react-native-paper';

import {Dialog} from '../Dialog';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {botConnectorAuthStore} from '../../store';
import type {DeleteAccountFailure} from '../../store/BotConnectorAuthStore';

/** The server only accepts this exact phrase, whatever the app language is. */
export const DELETE_PHRASE = 'HAPUS AKUN';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

/** Permanent account deletion: current password plus the typed phrase; the server re-checks both. */
export const DeleteAccountDialog: React.FC<Props> = ({visible, onDismiss}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const d = l10n.settings.deleteAccount;
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword('');
    setPhrase('');
    setError(null);
    setBusy(false);
  };
  const close = () => {
    if (!busy) {
      reset();
      onDismiss();
    }
  };

  const message = (reason: DeleteAccountFailure): string =>
    ({
      wrong_password: d.wrongPassword,
      confirmation: d.badPhrase,
      rate_limited: d.rateLimited,
      session: d.session,
      unavailable: d.unavailable,
      network: d.network,
    })[reason];

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await botConnectorAuthStore.deleteAccount(
      password,
      phrase.trim(),
    );
    if (result.ok) {
      reset();
      onDismiss();
      Alert.alert('BotConnector', d.done);
      return;
    }
    setBusy(false);
    setError(message(result.reason));
    if (result.reason === 'session') {
      // the app is already signed out locally: nothing more to confirm here
      reset();
      onDismiss();
    }
  };

  const ready = password.length > 0 && phrase.trim() === DELETE_PHRASE && !busy;

  return (
    <Dialog
      testID="delete-account-dialog"
      visible={visible}
      onDismiss={close}
      title={d.title}
      dismissable={!busy}
      avoidKeyboard
      actions={[
        {
          label: l10n.common.cancel,
          onPress: close,
          disabled: busy,
          testID: 'delete-account-cancel',
        },
        {
          label: busy ? d.working : d.confirm,
          onPress: confirm,
          mode: 'contained',
          disabled: !ready,
          loading: busy,
          testID: 'delete-account-confirm',
        },
      ]}>
      <View style={{gap: 12}}>
        <Text variant="bodyMedium">{d.warning}</Text>
        <TextInput
          testID="delete-account-phrase"
          mode="outlined"
          label={d.phraseLabel}
          value={phrase}
          onChangeText={setPhrase}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
        />
        <TextInput
          testID="delete-account-password"
          mode="outlined"
          label={d.passwordLabel}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          editable={!busy}
        />
        {error ? (
          <Text
            testID="delete-account-error"
            variant="bodySmall"
            style={{color: theme.colors.error}}>
            {error}
          </Text>
        ) : null}
      </View>
    </Dialog>
  );
};
