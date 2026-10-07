import React, {useContext, useEffect, useState} from 'react';
import {TouchableOpacity, View} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Checkbox,
  RadioButton,
  Text,
  TextInput as PaperTextInput,
} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {EyeIcon, EyeOffIcon} from '../../assets/icons';
import {byokProviderStore} from '../../store/ByokProviderStore';
import {
  BYOK_PROVIDERS,
  ByokApiError,
  fetchByokModels,
  getProviderMeta,
} from '../../api/byokProviders';
import type {ByokApiErrorCode, ByokProviderId} from '../../api/byokProviders';
import type {RemoteModelInfo} from '../../utils/types';

import {createStyles} from './styles';

interface AddProviderSheetProps {
  isVisible: boolean;
  onDismiss: () => void;
  initialProviderId?: ByokProviderId;
  onSaved?: (providerId: ByokProviderId) => void;
}

type TestState = 'idle' | 'ok' | 'error';

export const AddProviderSheet: React.FC<AddProviderSheetProps> = observer(
  ({isVisible, onDismiss, initialProviderId, onSaved}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const strings = l10n.components.addProvider;
    const styles = createStyles(theme);

    const [providerId, setProviderId] = useState<ByokProviderId | null>(null);
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [secureTextEntry, setSecureTextEntry] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [testState, setTestState] = useState<TestState>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [models, setModels] = useState<RemoteModelInfo[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [saveFailed, setSaveFailed] = useState(false);

    const selectProvider = (id: ByokProviderId) => {
      const saved = byokProviderStore.getConfig(id);
      setProviderId(id);
      // Editing an already configured provider starts from the stored key,
      // never from a blank field.
      setApiKey(byokProviderStore.getKey(id));
      setBaseUrl(saved?.baseUrl ?? '');
      setTestState('idle');
      setErrorMessage('');
      setModels([]);
      setSelectedIds([]);
      setSaveFailed(false);
    };

    const handleSelect = (id: ByokProviderId) => {
      if (id === providerId) {
        return;
      }
      selectProvider(id);
    };

    useEffect(() => {
      if (!isVisible) {
        return;
      }
      setProviderId(null);
      setApiKey('');
      setBaseUrl('');
      setSecureTextEntry(true);
      setIsTesting(false);
      setTestState('idle');
      setErrorMessage('');
      setModels([]);
      setSelectedIds([]);
      setIsSaving(false);
      setIsRemoving(false);
      setSaveFailed(false);
      if (initialProviderId) {
        selectProvider(initialProviderId);
      }
    }, [isVisible, initialProviderId]);

    const errorForCode = (code: ByokApiErrorCode): string => {
      switch (code) {
        case 'invalidKey':
          return strings.errorInvalidKey;
        case 'timeout':
          return strings.errorTimeout;
        case 'network':
          return strings.errorNetwork;
        case 'notFound':
          return strings.errorNotFound;
        default:
          return strings.errorServer;
      }
    };

    const handleTest = async () => {
      if (!providerId || isTesting) {
        return;
      }
      const key = apiKey.trim();
      if (!key) {
        setTestState('error');
        setErrorMessage(strings.errorMissingKey);
        return;
      }
      const meta = getProviderMeta(providerId);
      const base = baseUrl.trim();
      if (meta.requiresBaseUrl && !base) {
        setTestState('error');
        setErrorMessage(strings.errorMissingBaseUrl);
        return;
      }

      setIsTesting(true);
      setTestState('idle');
      setErrorMessage('');
      setModels([]);
      setSelectedIds([]);
      try {
        const list = await fetchByokModels(providerId, {
          apiKey: key,
          baseUrl: base || undefined,
        });
        const saved = byokProviderStore.getConfig(providerId);
        const savedSelected = saved?.selectedModels ?? [];
        const kept = list
          .filter(model => savedSelected.includes(model.id))
          .map(model => model.id);
        setModels(list);
        setSelectedIds(
          kept.length > 0 ? kept : list.length === 1 ? [list[0].id] : [],
        );
        setTestState('ok');
      } catch (error) {
        setTestState('error');
        setErrorMessage(
          errorForCode(
            error instanceof ByokApiError ? error.code : ('server' as const),
          ),
        );
      } finally {
        setIsTesting(false);
      }
    };

    const toggleModel = (id: string) => {
      setSelectedIds(prev =>
        prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id],
      );
    };

    const canSave =
      !!providerId &&
      testState === 'ok' &&
      selectedIds.length > 0 &&
      !isTesting &&
      !isSaving &&
      !isRemoving;

    const handleSave = async () => {
      if (!providerId || !canSave) {
        return;
      }
      const meta = getProviderMeta(providerId);
      setIsSaving(true);
      setSaveFailed(false);
      try {
        const ok = await byokProviderStore.saveProvider(
          {
            providerId,
            baseUrl: meta.requiresBaseUrl ? baseUrl.trim() : '',
            selectedModels: selectedIds,
          },
          apiKey.trim(),
        );
        if (ok) {
          onSaved?.(providerId);
          onDismiss();
        } else {
          setSaveFailed(true);
        }
      } finally {
        setIsSaving(false);
      }
    };

    const handleRemove = async () => {
      if (!providerId || isRemoving) {
        return;
      }
      setIsRemoving(true);
      setSaveFailed(false);
      try {
        const ok = await byokProviderStore.removeProvider(providerId);
        if (ok) {
          onDismiss();
        } else {
          setSaveFailed(true);
        }
      } finally {
        setIsRemoving(false);
      }
    };

    const selectedMeta = providerId ? getProviderMeta(providerId) : null;
    const isConfigured = providerId
      ? !!byokProviderStore.getConfig(providerId)
      : false;

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onDismiss}
        title={strings.title}
        snapPoints={['85%']}>
        <Sheet.ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.description}>{strings.description}</Text>

          <Text style={styles.sectionLabel} accessibilityRole="header">
            {strings.selectProvider}
          </Text>
          {BYOK_PROVIDERS.map(meta => {
            const configured = !!byokProviderStore.getConfig(meta.id);
            const selected = providerId === meta.id;
            return (
              <TouchableOpacity
                key={meta.id}
                testID={`byok-provider-option-${meta.id}`}
                accessibilityRole="radio"
                accessibilityLabel={meta.label}
                accessibilityState={{selected}}
                style={[
                  styles.providerRow,
                  selected && styles.providerRowSelected,
                ]}
                onPress={() => handleSelect(meta.id)}>
                <RadioButton
                  value={meta.id}
                  status={selected ? 'checked' : 'unchecked'}
                  uncheckedColor={theme.colors.onSurfaceVariant}
                />
                <Text style={styles.providerLabel}>{meta.label}</Text>
                {configured && (
                  <Text
                    testID={`byok-configured-${meta.id}`}
                    style={styles.configuredBadge}>
                    {strings.configuredBadge}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}

          {providerId && selectedMeta && (
            <>
              <View style={styles.inputSpacing}>
                <TextInput
                  testID="byok-key-input"
                  label={strings.apiKeyLabel}
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder={strings.apiKeyPlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  secureTextEntry={secureTextEntry}
                  right={
                    <PaperTextInput.Icon
                      testID="byok-key-visibility"
                      accessibilityLabel={
                        secureTextEntry
                          ? strings.showKeyAccessibilityLabel
                          : strings.hideKeyAccessibilityLabel
                      }
                      icon={({color}) =>
                        secureTextEntry ? (
                          <EyeIcon width={24} height={24} stroke={color} />
                        ) : (
                          <EyeOffIcon width={24} height={24} stroke={color} />
                        )
                      }
                      onPress={() => setSecureTextEntry(prev => !prev)}
                    />
                  }
                />
                <Text style={styles.hint}>{strings.apiKeyHint}</Text>
              </View>

              {selectedMeta.requiresBaseUrl ? (
                <View style={styles.inputSpacing}>
                  <TextInput
                    testID="byok-baseurl-input"
                    label={strings.baseUrlLabel}
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    placeholder={strings.baseUrlPlaceholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                  <Text style={styles.hint}>{strings.baseUrlHelp}</Text>
                </View>
              ) : (
                <Text testID="byok-default-url" style={styles.hint}>
                  {t(strings.defaultBaseUrl, {
                    url: selectedMeta.defaultBaseUrl,
                  })}
                </Text>
              )}

              <View style={styles.inputSpacing}>
                <Button
                  testID="byok-test-button"
                  mode="contained-tonal"
                  icon="lanconnect"
                  onPress={handleTest}
                  loading={isTesting}
                  disabled={isTesting || isSaving || isRemoving}
                  accessibilityLabel={strings.testConnection}>
                  {strings.testConnection}
                </Button>
              </View>

              {isTesting && (
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.hint}>{strings.testing}</Text>
                </View>
              )}

              {testState === 'error' && (
                <Text
                  testID="byok-test-error"
                  accessibilityRole="alert"
                  style={styles.errorText}>
                  {errorMessage}
                </Text>
              )}

              {testState === 'ok' && (
                <Text
                  testID="byok-test-success"
                  accessibilityLiveRegion="polite"
                  style={styles.successText}>
                  {t(strings.testSuccess, {count: models.length})}
                </Text>
              )}

              {testState === 'ok' && models.length === 0 && (
                <Text testID="byok-no-models" style={styles.hint}>
                  {strings.noModels}
                </Text>
              )}

              {testState === 'ok' && models.length > 0 && (
                <View style={styles.modelSection}>
                  <Text style={styles.sectionLabel} accessibilityRole="header">
                    {strings.selectModels}
                  </Text>
                  {models.map(model => {
                    const checked = selectedIds.includes(model.id);
                    return (
                      <TouchableOpacity
                        key={model.id}
                        testID={`byok-model-${model.id}`}
                        accessibilityRole="checkbox"
                        accessibilityLabel={model.id}
                        accessibilityState={{checked}}
                        style={styles.modelRow}
                        onPress={() => toggleModel(model.id)}>
                        <Checkbox
                          status={checked ? 'checked' : 'unchecked'}
                          color={theme.colors.primary}
                        />
                        <Text style={styles.modelLabel}>{model.id}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {isConfigured && (
                <View style={styles.inputSpacing}>
                  <Button
                    testID="byok-remove-button"
                    mode="outlined"
                    icon="key-remove"
                    onPress={handleRemove}
                    loading={isRemoving}
                    disabled={isRemoving || isTesting || isSaving}
                    textColor={theme.colors.error}
                    style={styles.removeButton}>
                    {strings.remove}
                  </Button>
                </View>
              )}
            </>
          )}
        </Sheet.ScrollView>
        <Sheet.Actions>
          <View style={styles.buttonsContainer}>
            <View style={styles.actionColumn}>
              {saveFailed && (
                <Text
                  testID="byok-save-error"
                  accessibilityRole="alert"
                  style={styles.errorText}>
                  {strings.saveError}
                </Text>
              )}
              <Button
                testID="byok-save-button"
                mode="contained"
                onPress={handleSave}
                loading={isSaving}
                disabled={!canSave}
                accessibilityLabel={strings.save}
                accessibilityHint={
                  canSave ? undefined : strings.saveDisabledHint
                }
                style={styles.saveButton}>
                {strings.save}
              </Button>
            </View>
          </View>
        </Sheet.Actions>
      </Sheet>
    );
  },
);
