import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexShrink: 1,
      minWidth: 0,
      justifyContent: 'center',
      minHeight: 44,
      paddingRight: 4,
    },
    pressed: {
      opacity: 0.6,
    },
    title: {
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    modelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minWidth: 0,
    },
    model: {
      flexShrink: 1,
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.onSurfaceVariant,
    },
  });
