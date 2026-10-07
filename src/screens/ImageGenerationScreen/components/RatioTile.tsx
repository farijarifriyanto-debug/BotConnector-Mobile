import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';

import {useTheme} from '../../../hooks';
import type {ImageSizeRatio} from '../../../utils/imageGenerationSize';

// Small outlined frame in the real proportions: the shape explains the
// choice better than the word does.
const FRAME: Record<ImageSizeRatio, {width: number; height: number}> = {
  square: {width: 26, height: 26},
  landscape: {width: 34, height: 22},
  portrait: {width: 22, height: 34},
};

type Props = {
  ratio: ImageSizeRatio;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
};

export const RatioTile: React.FC<Props> = ({
  ratio,
  label,
  selected,
  disabled,
  onPress,
  testID,
}) => {
  const theme = useTheme();
  const tint = selected ? theme.colors.primary : theme.colors.onSurfaceVariant;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{selected, disabled: Boolean(disabled)}}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.tile,
        {
          backgroundColor: selected
            ? theme.colors.primaryContainer
            : theme.colors.surface,
          borderColor: selected
            ? theme.colors.primary
            : theme.colors.outlineVariant,
        },
        disabled && styles.disabled,
      ]}>
      <View style={styles.frameBox}>
        <View
          style={[
            FRAME[ratio],
            styles.frame,
            {
              borderColor: tint,
              backgroundColor: selected ? tint + '22' : undefined,
            },
          ]}
        />
      </View>
      <Text
        variant="labelMedium"
        style={{
          color: selected ? theme.colors.primary : theme.colors.onSurface,
        }}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 10,
  },
  frameBox: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    borderWidth: 2,
    borderRadius: 5,
  },
  disabled: {
    opacity: 0.38,
  },
});
