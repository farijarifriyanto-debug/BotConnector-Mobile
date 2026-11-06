import React, {useContext, useState} from 'react';
import {ActivityIndicator, Pressable, View} from 'react-native';
import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';
import {BottomSheetTextInput} from '@gorhom/bottom-sheet';

import {useTheme} from '../../hooks';
import {modelStore} from '../../store';
import {L10nContext} from '../../utils';
import {Model, ModelOrigin} from '../../utils/types';
import {matchesModelSearch} from '../../utils/botconnectorModels';
import {CheckSmIcon, SearchSmIcon, XSmIcon} from '../../assets/icons';
import {createStyles} from './styles';

export interface ModelPickerListProps {
  /** Called after a model was chosen (the sheet closes). */
  onSelected: () => void;
  /** Search field focus, so the host sheet does not close on keyboard show. */
  onSearchFocusChange?: (focused: boolean) => void;
}

export const ModelPickerList: React.FC<ModelPickerListProps> = observer(
  ({onSelected, onSearchFocusChange}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const text = l10n.components.modelPicker;
    const [query, setQuery] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    const activeId = modelStore.activeModelId;

    const localModels = modelStore.availableModels.filter(
      m =>
        m.origin !== ModelOrigin.REMOTE &&
        matchesModelSearch(query, [m.name, m.author]),
    );
    // BYOK-only: every remote server is user-configured, so all remote
    // models live in one section.
    const customModels = modelStore.remoteModels.filter(m =>
      matchesModelSearch(query, [m.name, m.author]),
    );

    const select = async (id: string, run: () => Promise<void>) => {
      if (busyId) {
        return;
      }
      setBusyId(id);
      try {
        await run();
        onSelected();
      } catch (error) {
        console.warn('[ModelPicker] select failed:', error);
      } finally {
        setBusyId(null);
      }
    };

    const selectModel = (model: Model) =>
      select(model.id, () => modelStore.selectModel(model));

    const renderRow = (
      key: string,
      title: string,
      subtitle: string | undefined,
      onPress: () => void,
      extra?: React.ReactNode,
    ) => {
      const active = key === activeId;
      return (
        <Pressable
          key={key}
          onPress={onPress}
          disabled={!!busyId}
          accessibilityRole="button"
          accessibilityState={{selected: active, busy: busyId === key}}
          accessibilityLabel={title}
          style={({pressed}) => [
            styles.row,
            active && styles.rowActive,
            pressed && styles.rowPressed,
          ]}>
          <View style={styles.rowText}>
            <Text
              numberOfLines={1}
              style={[styles.rowTitle, active && styles.rowTitleActive]}
              maxFontSizeMultiplier={1.3}>
              {title}
            </Text>
            {subtitle ? (
              <Text
                numberOfLines={1}
                style={styles.rowSubtitle}
                maxFontSizeMultiplier={1.3}>
                {subtitle}
              </Text>
            ) : null}
            {extra}
          </View>
          {busyId === key ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : active ? (
            <CheckSmIcon stroke={theme.colors.primary} />
          ) : null}
        </Pressable>
      );
    };

    const sectionTitle = (title: string) => (
      <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
        {title}
      </Text>
    );

    const nothingFound =
      query.trim().length > 0 && !localModels.length && !customModels.length;

    return (
      <View style={styles.container}>
        <View style={styles.searchBox}>
          <SearchSmIcon stroke={theme.colors.onSurfaceVariant} />
          <BottomSheetTextInput
            value={query}
            onChangeText={setQuery}
            placeholder={text.searchPlaceholder}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={text.searchPlaceholder}
            onFocus={() => onSearchFocusChange?.(true)}
            onBlur={() => onSearchFocusChange?.(false)}
            maxFontSizeMultiplier={1.3}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={text.clearSearch}>
              <XSmIcon stroke={theme.colors.onSurfaceVariant} />
            </Pressable>
          )}
        </View>

        {localModels.length > 0 && (
          <>
            {sectionTitle(text.onDeviceSection)}
            {localModels.map(model =>
              renderRow(model.id, model.name, text.onDevice, () =>
                selectModel(model),
              ),
            )}
          </>
        )}

        {customModels.length > 0 && (
          <>
            {sectionTitle(text.customSection)}
            {customModels.map(model =>
              renderRow(model.id, model.name, model.author, () =>
                selectModel(model),
              ),
            )}
          </>
        )}

        {nothingFound && <Text style={styles.emptyText}>{text.noResults}</Text>}

        <Text style={styles.footnote}>{text.localBridgeNote}</Text>
      </View>
    );
  },
);
