import React, {useState} from 'react';
import {View, FlatList, useWindowDimensions} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {chunkIntoRows, computePalGridLayout} from './palGridLayout';

// Components
import {PalGridRow} from './components/PalGridRow';
import {AddPalMenu} from './components/AddPalMenu';
import {BicoMascot} from '../../components/BicoMascot';

// Unified pal sheet component
import {PalSheet} from '../../components/PalsSheets';

// Pal template factories
import {
  createNewAssistantPal,
  createNewRoleplayPal,
  createNewVideoPal,
  preparePalForEditing,
} from '../../utils/pal-templates';

import {palStore, Pal} from '../../store';

/**
 * Persona library — BYOK-only: every pal is local. Tapping a card opens the
 * edit sheet; the chat icon on a card activates the pal and jumps to chat
 * (handled inside SquarePalCard).
 */
export const PalsScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const {width: windowWidth} = useWindowDimensions();

  // Spec J: upstream builtin personas (Lookie/Pip) are masked at the list
  // level as well, so no render path can surface them as BotConnector
  // defaults. The store already drops them from `pals` on load; this is the
  // list-level backstop (and covers the mocked store in tests).
  const hiddenPalIds: string[] = palStore.hiddenPalIds ?? [];
  const notHidden = (pal: {id: string}) => !hiddenPalIds.includes(pal.id);

  // Unified pal sheet state
  const [showPalSheet, setShowPalSheet] = useState(false);
  const [currentPal, setCurrentPal] = useState<Partial<Pal> | null>(null);

  const handleCreatePal = (type: 'assistant' | 'roleplay' | 'video') => {
    let newPal: Partial<Pal>;

    switch (type) {
      case 'assistant':
        newPal = createNewAssistantPal();
        break;
      case 'roleplay':
        newPal = createNewRoleplayPal();
        break;
      case 'video':
        newPal = createNewVideoPal();
        break;
      default:
        newPal = createNewAssistantPal();
    }

    setCurrentPal(newPal);
    setShowPalSheet(true);
  };

  const handlePalPress = (pal: Pal) => {
    setCurrentPal(preparePalForEditing(pal));
    setShowPalSheet(true);
  };

  const localPals = palStore.getLocalPals().filter(notHidden);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <BicoMascot variant="mark" width={72} />
      <Text style={styles.emptyStateText}>
        {'No personas yet.\nCreate your first persona using the + button!'}
      </Text>
    </View>
  );

  const {columns, cardWidth} = computePalGridLayout(windowWidth);
  const rows = chunkIntoRows(localPals, columns);

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={row => row.key}
        renderItem={({item}) => (
          <PalGridRow
            row={item}
            cardWidth={cardWidth}
            onPalPress={handlePalPress}
          />
        )}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        testID="pals-flat-list"
      />

      {/* Create-persona entry point */}
      <AddPalMenu
        iconColor={theme.colors.onSurfaceVariant}
        iconSize={24}
        onCreatePal={handleCreatePal}
      />

      {/* Unified Pal Creation/Editing Sheet */}
      {showPalSheet && currentPal && (
        <PalSheet
          isVisible={showPalSheet}
          onClose={() => {
            setShowPalSheet(false);
            setCurrentPal(null);
          }}
          pal={currentPal}
        />
      )}
    </View>
  );
});

export default PalsScreen;
