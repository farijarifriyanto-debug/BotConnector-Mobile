import React, {useContext, useState} from 'react';
import {ActivityIndicator, Pressable, View} from 'react-native';
import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';
import {BottomSheetTextInput} from '@gorhom/bottom-sheet';

import {useTheme} from '../../hooks';
import {modelStore, serverStore} from '../../store';
import {L10nContext} from '../../utils';
import {Model, ModelOrigin} from '../../utils/types';
import {isBotConnectorApiUrl} from '../../config/botconnector';
import {
  CloudModelDisplay,
  matchesModelSearch,
  sortCloudModels,
} from '../../utils/botconnectorModels';
import {CheckSmIcon, SearchSmIcon, XSmIcon} from '../../assets/icons';
import {createStyles} from './styles';

export interface ModelPickerListProps {
  /** Called after a model was chosen (the sheet closes). */
  onSelected: () => void;
  /** Opens the screen where an account/server can be connected. */
  onConnectAccount?: () => void;
  /** Search field focus, so the host sheet does not close on keyboard show. */
  onSearchFocusChange?: (focused: boolean) => void;
}

interface CloudRow {
  serverId: string;
  display: CloudModelDisplay;
}

const BADGE_KEYS = ['vision', 'think', 'tools', 'web'] as const;

export const ModelPickerList: React.FC<ModelPickerListProps> = observer(
  ({onSelected, onConnectAccount, onSearchFocusChange}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const text = l10n.components.modelPicker;
    const [query, setQuery] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    const cloudServers = serverStore.servers.filter(s =>
      isBotConnectorApiUrl(s.url),
    );
    const activeId = modelStore.activeModelId;

    // Plain derivation: observer() tracks the store reads and re-renders.
    const cloudRows: CloudRow[] = cloudServers.flatMap(server =>
      sortCloudModels(serverStore.cloudModelsForServer(server.id)).map(
        display => ({serverId: server.id, display}),
      ),
    );

    const badgeLabel = (key: (typeof BADGE_KEYS)[number]) => text.badges[key];

    const filteredCloud = cloudRows.filter(({display}) =>
      matchesModelSearch(query, [
        display.displayName,
        display.family,
        display.canonicalId,
        ...BADGE_KEYS.filter(k => display.badges[k]).map(badgeLabel),
      ]),
    );
    const localModels = modelStore.availableModels.filter(
      m =>
        m.origin !== ModelOrigin.REMOTE &&
        matchesModelSearch(query, [m.name, m.author]),
    );
    const customModels = modelStore.remoteModels.filter(
      m =>
        !serverStore.isBotConnectorServer(m.serverId) &&
        matchesModelSearch(query, [m.name, m.author]),
    );

    const cloudLoading =
      cloudServers.length > 0 &&
      cloudRows.length === 0 &&
      serverStore.isLoading;
    const cloudError =
      cloudServers.length > 0 &&
      cloudRows.length === 0 &&
      !serverStore.isLoading
        ? serverStore.error
        : null;

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

    const selectCloud = ({serverId, display}: CloudRow) =>
      select(`${serverId}/${display.remoteModelId}`, async () => {
        // Adding is implicit: the account already grants this model.
        serverStore.addUserSelectedModel(serverId, display.remoteModelId);
        const model = modelStore.remoteModels.find(
          m => m.id === `${serverId}/${display.remoteModelId}`,
        );
        if (!model) {
          throw new Error('Cloud model is not available');
        }
        await modelStore.selectModel(model);
      });

    const selectModel = (model: Model) =>
      select(model.id, () => modelStore.selectModel(model));

    const renderBadges = (display: CloudModelDisplay) => {
      const badges = BADGE_KEYS.filter(k => display.badges[k]);
      if (!badges.length && display.access === 'other') {
        return null;
      }
      return (
        <View style={styles.badges}>
          {display.access !== 'other' && (
            <View style={[styles.badge, styles.accessBadge]}>
              <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
                {text.access[display.access]}
              </Text>
            </View>
          )}
          {badges.map(key => (
            <View key={key} style={styles.badge}>
              <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
                {badgeLabel(key)}
              </Text>
            </View>
          ))}
        </View>
      );
    };

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
      query.trim().length > 0 &&
      !filteredCloud.length &&
      !localModels.length &&
      !customModels.length;

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

        {sectionTitle(text.cloudSection)}
        {cloudServers.length === 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{text.cloudNotConnected}</Text>
            {onConnectAccount && (
              <Pressable
                onPress={onConnectAccount}
                accessibilityRole="button"
                style={styles.noticeButton}>
                <Text style={styles.noticeButtonText}>
                  {text.connectAccount}
                </Text>
              </Pressable>
            )}
          </View>
        ) : cloudLoading ? (
          <View style={styles.notice}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.noticeText}>{text.loadingModels}</Text>
          </View>
        ) : cloudError ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{text.loadFailed}</Text>
            <Pressable
              onPress={() => serverStore.fetchAllRemoteModels()}
              accessibilityRole="button"
              style={styles.noticeButton}>
              <Text style={styles.noticeButtonText}>{text.retry}</Text>
            </Pressable>
          </View>
        ) : (
          filteredCloud.map(row =>
            renderRow(
              `${row.serverId}/${row.display.remoteModelId}`,
              row.display.displayName,
              row.display.family,
              () => selectCloud(row),
              renderBadges(row.display),
            ),
          )
        )}

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
