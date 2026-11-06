import React, {useContext, useState} from 'react';
import {TouchableOpacity, View} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {byokProviderStore} from '../../store/ByokProviderStore';
import {getProviderMeta} from '../../api/byokProviders';
import type {ByokProviderId} from '../../api/byokProviders';
import {AddProviderSheet} from '../AddProviderSheet';

import {createStyles} from './styles';

/**
 * Settings → Providers (2.1.0, BYOK-only).
 *
 * Lists the providers the user configured with their own keys. Tapping a row
 * opens the same AddProviderSheet the model picker uses, primed for editing
 * (and removal); the trailing row opens it blank.
 */
export const ProvidersSection: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const strings = l10n.settings.providersSection;
  const styles = createStyles(theme);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<
    ByokProviderId | undefined
  >(undefined);

  const openForEdit = (providerId: ByokProviderId) => {
    setEditingProviderId(providerId);
    setSheetVisible(true);
  };

  const openBlank = () => {
    setEditingProviderId(undefined);
    setSheetVisible(true);
  };

  return (
    <View>
      <Text style={styles.description}>{strings.description}</Text>

      {byokProviderStore.providers.length === 0 && (
        <Text testID="providers-empty" style={styles.empty}>
          {strings.empty}
        </Text>
      )}

      {byokProviderStore.providers.map(provider => {
        const label = getProviderMeta(provider.providerId).label;
        return (
          <TouchableOpacity
            key={provider.providerId}
            testID={`provider-row-${provider.providerId}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={styles.providerRow}
            onPress={() => openForEdit(provider.providerId)}>
            <View style={styles.providerText}>
              <Text style={styles.providerLabel}>{label}</Text>
              <Text style={styles.providerDetail}>
                {provider.selectedModels.length > 0
                  ? t(strings.modelCount, {
                      count: provider.selectedModels.length,
                    })
                  : strings.noModelsSelected}
              </Text>
            </View>
            <Text style={styles.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        testID="provider-add-row"
        accessibilityRole="button"
        accessibilityLabel={strings.addProvider}
        style={styles.addRow}
        onPress={openBlank}>
        <Text style={styles.addLabel}>{strings.addProvider}</Text>
      </TouchableOpacity>

      <AddProviderSheet
        isVisible={sheetVisible}
        onDismiss={() => setSheetVisible(false)}
        initialProviderId={editingProviderId}
      />
    </View>
  );
});
