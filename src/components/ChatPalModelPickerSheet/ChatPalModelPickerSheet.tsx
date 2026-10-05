import React, {useRef, useContext, useEffect} from 'react';
import {Alert, Dimensions, View, Pressable, Keyboard} from 'react-native';
import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetFlatListMethods,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {modelStore, palStore, chatSessionStore} from '../../store';
import {CustomBackdrop} from '../Sheet/CustomBackdrop';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import type {Pal} from '../../types/pal';
import {CloseIcon, SettingsIcon} from '../../assets/icons';
import {ModelPickerList} from '../ModelPickerList';

type Tab = 'models' | 'pals';

interface ChatPalModelPickerSheetProps {
  isVisible: boolean;
  /** Tab shown when the sheet opens. Models first: Persona is optional. */
  initialTab?: Tab;
  /** Opens the place where a BotConnector account can be connected. */
  onConnectAccount?: () => void;
  chatInputHeight: number;
  onClose: () => void;
  onModelSelect?: (modelId: string) => void;
  onPalSelect?: (palId: string | undefined) => void;
  onPalSettingsSelect?: (pal: Pal) => void;
}

export const ChatPalModelPickerSheet = observer(
  ({
    isVisible,
    initialTab = 'models',
    onConnectAccount,
    onClose,
    onModelSelect,
    onPalSelect,
    onPalSettingsSelect,
    chatInputHeight,
  }: ChatPalModelPickerSheetProps) => {
    const [activeTab, setActiveTab] = React.useState<Tab>(initialTab);
    const searchFocusedRef = useRef(false);
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles({theme});
    const bottomSheetRef = useRef<BottomSheet>(null);
    const flatListRef = useRef<BottomSheetFlatListMethods>(null);

    const TABS = React.useMemo(
      // Models first (index 0): the sheet must open on models, never on Pals.
      () => [
        {
          id: 'models' as Tab,
          label: l10n.components.chatPalModelPickerSheet.modelsTab,
        },
        {
          id: 'pals' as Tab,
          label: l10n.components.chatPalModelPickerSheet.palsTab,
        },
      ],
      [
        l10n.components.chatPalModelPickerSheet.palsTab,
        l10n.components.chatPalModelPickerSheet.modelsTab,
      ],
    );

    // Dismiss keyboard when sheet becomes visible
    useEffect(() => {
      if (isVisible) {
        Keyboard.dismiss();
      }
    }, [isVisible]);

    // Close sheet when keyboard opens
    useEffect(() => {
      const keyboardDidShowListener = Keyboard.addListener(
        'keyboardDidShow',
        () => {
          // Typing in the model search must not close the sheet.
          if (isVisible && !searchFocusedRef.current) {
            onClose();
          }
        },
      );

      return () => {
        keyboardDidShowListener.remove();
      };
    }, [isVisible, onClose]);

    const handleTabPress = (tab: Tab, index: number) => {
      setActiveTab(tab);
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
      });
    };

    const renderTab = (tab: Tab, label: string, index: number) => (
      <Pressable
        key={tab}
        style={[styles.tab, activeTab === tab && styles.activeTab]}
        onPress={() => handleTabPress(tab, index)}>
        <Text
          style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
          {label}
        </Text>
      </Pressable>
    );

    const handlePalSelect = React.useCallback(
      async (pal: (typeof palStore.pals)[0] | undefined) => {
        await chatSessionStore.setActivePal(pal?.id);
        if (
          pal?.defaultModel &&
          modelStore.activeModel &&
          pal.defaultModel?.id !== modelStore.activeModelId
        ) {
          const palDefaultModel = modelStore.availableModels.find(
            m => m.id === pal.defaultModel?.id,
          );
          if (palDefaultModel) {
            Alert.alert(
              l10n.components.chatPalModelPickerSheet.confirmationTitle,
              t(l10n.components.chatPalModelPickerSheet.modelSwitchMessage, {
                modelName: palDefaultModel.name,
              }),
              [
                {
                  text: l10n.components.chatPalModelPickerSheet.keepButton,
                  style: 'cancel',
                },
                {
                  text: l10n.components.chatPalModelPickerSheet.switchButton,
                  onPress: () => {
                    modelStore.selectModel(palDefaultModel);
                  },
                },
              ],
            );
          }
        }
        onPalSelect?.(pal?.id);
        onClose();
      },
      [onPalSelect, onClose, l10n.components.chatPalModelPickerSheet],
    );

    const renderDisablePalItem = React.useCallback(() => {
      const noActivePal = !chatSessionStore.activePalId;
      if (noActivePal) {
        return null;
      }
      return (
        <Pressable
          key="disable-pal"
          style={styles.listItem}
          onPress={() => handlePalSelect(undefined)}>
          <CloseIcon stroke={theme.colors.onSurface} />
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>
              {l10n.components.chatPalModelPickerSheet.noPal}
            </Text>
            <Text style={styles.itemSubtitle}>
              {l10n.components.chatPalModelPickerSheet.disablePal}
            </Text>
          </View>
        </Pressable>
      );
    }, [
      styles,
      theme.colors.onSurface,
      l10n.components.chatPalModelPickerSheet.noPal,
      l10n.components.chatPalModelPickerSheet.disablePal,
      handlePalSelect,
    ]);

    const getCapabilityText = React.useCallback(
      (pal: Pal): string => {
        if (pal.capabilities?.video) {
          return l10n.components.chatPalModelPickerSheet.videoType;
        }

        // TODO: Add support for other capabilities
        // Use assistant for now.
        return l10n.components.chatPalModelPickerSheet.assistantType;
      },
      [l10n.components.chatPalModelPickerSheet],
    );

    const renderPalItem = React.useCallback(
      (pal: (typeof palStore.pals)[0]) => {
        const isActivePal = pal.id === chatSessionStore.activePalId;
        return (
          <Pressable
            key={pal.id}
            style={[styles.listItem, isActivePal && styles.activeListItem]}
            onPress={() => handlePalSelect(pal)}>
            <View style={styles.itemContent}>
              <View style={styles.itemTextContent}>
                <Text
                  style={[
                    styles.itemTitle,
                    isActivePal && styles.activeItemTitle,
                  ]}>
                  {pal.name}
                </Text>
                <Text
                  style={[
                    styles.itemSubtitle,
                    isActivePal && styles.activeItemSubtitle,
                  ]}>
                  {getCapabilityText(pal)}
                </Text>
              </View>
              {isActivePal && pal.type === 'local' && onPalSettingsSelect && (
                <Pressable
                  style={styles.settingsButton}
                  onPress={e => {
                    e.stopPropagation();
                    onPalSettingsSelect(pal);
                  }}>
                  <SettingsIcon
                    width={16}
                    height={16}
                    stroke={
                      isActivePal
                        ? styles.activeItemTitle.color
                        : styles.itemSubtitle.color
                    }
                  />
                </Pressable>
              )}
            </View>
          </Pressable>
        );
      },
      [
        styles.listItem,
        styles.activeListItem,
        styles.itemContent,
        styles.itemTextContent,
        styles.settingsButton,
        styles.itemTitle,
        styles.activeItemTitle,
        styles.itemSubtitle,
        styles.activeItemSubtitle,
        getCapabilityText,
        handlePalSelect,
        onPalSettingsSelect,
      ],
    );

    const renderContent = React.useCallback(
      ({item}: {item: (typeof TABS)[0]}) => (
        <View style={{width: Dimensions.get('window').width}}>
          <BottomSheetScrollView
            contentContainerStyle={{paddingBottom: chatInputHeight + 66}}>
            {item.id === 'models' ? (
              <ModelPickerList
                onSelected={() => {
                  onModelSelect?.(modelStore.activeModelId ?? '');
                  onClose();
                }}
                onConnectAccount={onConnectAccount}
                onSearchFocusChange={focused => {
                  searchFocusedRef.current = focused;
                }}
              />
            ) : (
              [renderDisablePalItem(), ...palStore.pals.map(renderPalItem)]
            )}
          </BottomSheetScrollView>
        </View>
      ),
      [
        chatInputHeight,
        renderDisablePalItem,
        renderPalItem,
        onModelSelect,
        onClose,
        onConnectAccount,
      ],
    );

    const onViewableItemsChanged = React.useCallback(
      ({viewableItems}: {viewableItems: any[]}) => {
        if (viewableItems[0]) {
          setActiveTab(viewableItems[0].item.id);
        }
      },
      [],
    );

    const viewabilityConfig = React.useRef({
      itemVisiblePercentThreshold: 90,
      minimumViewTime: 100,
    }).current;

    // If the snapPoints not memoized, the sheet gets closed when the tab is changed for the first time.
    const snapPoints = React.useMemo(() => ['70%'], []);

    return (
      <BottomSheet
        ref={bottomSheetRef}
        // index={-1} // remove this line to make it visible by default
        onClose={onClose}
        enablePanDownToClose
        snapPoints={snapPoints} // Dynamic sizing is not working properly in all situations, like keyboard open/close android/ios ...
        enableDynamicSizing={false}
        backdropComponent={isVisible ? CustomBackdrop : undefined} // on android we need this check to ensure it doenst' block interaction
        backgroundStyle={{
          backgroundColor: theme.colors.background,
        }}
        handleIndicatorStyle={{
          backgroundColor: theme.colors.primary,
        }}
        // Add these props to better handle gestures
        enableContentPanningGesture={false}
        enableHandlePanningGesture
        // Disable accessible so Appium/e2e tests can access child elements on iOS.
        // Without this, BottomSheet sets accessible={true} which collapses all
        // children from the accessibility tree. Same fix as Sheet.tsx.
        // See: https://github.com/gorhom/react-native-bottom-sheet/issues/1141
        accessible={false}>
        <View style={styles.tabs}>
          {TABS.map((tab, index) => renderTab(tab.id, tab.label, index))}
        </View>
        <BottomSheetFlatList
          ref={flatListRef}
          data={TABS}
          initialScrollIndex={initialTab === 'pals' ? 1 : 0}
          getItemLayout={(_, index) => ({
            length: Dimensions.get('window').width,
            offset: Dimensions.get('window').width * index,
            index,
          })}
          renderItem={renderContent}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyExtractor={item => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />
      </BottomSheet>
    );
  },
);
