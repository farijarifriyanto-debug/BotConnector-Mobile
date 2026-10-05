import React, {useContext} from 'react';
import {Pressable, View} from 'react-native';
import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';

import {createStyles} from './styles';
import {chatSessionStore, modelStore, uiStore} from '../../store';
import {L10nContext} from '../../utils';
import {useTheme} from '../../hooks';
import {ChevronDownSmIcon} from '../../assets/icons';

/**
 * Compact two-line header: chat title over the active model. The whole block is
 * the model switcher — tapping it opens the model picker sheet directly.
 * Font scaling is capped so the two lines never overlap at large Dynamic Type.
 */
export const ChatHeaderTitle: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const activeSessionId = chatSessionStore.activeSessionId;
  const activeSession = chatSessionStore.sessions.find(
    session => session.id === activeSessionId,
  );
  const activeModel = modelStore.activeModel;
  const modelLabel =
    activeModel?.name || l10n.components.chatHeaderTitle.chooseModel;

  return (
    <Pressable
      testID="chat-header-model-switcher"
      onPress={() => uiStore.openModelPicker('models')}
      accessibilityRole="button"
      accessibilityLabel={`${l10n.components.chatHeaderTitle.switchModel}: ${modelLabel}`}
      hitSlop={{top: 6, bottom: 6}}
      style={({pressed}) => [styles.container, pressed && styles.pressed]}>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={styles.title}
        maxFontSizeMultiplier={1.2}>
        {activeSession?.title || l10n.components.chatHeaderTitle.defaultTitle}
      </Text>
      <View style={styles.modelRow}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.model}
          maxFontSizeMultiplier={1.2}>
          {modelLabel}
        </Text>
        <ChevronDownSmIcon
          width={14}
          height={14}
          stroke={theme.colors.onSurfaceVariant}
        />
      </View>
    </Pressable>
  );
});
