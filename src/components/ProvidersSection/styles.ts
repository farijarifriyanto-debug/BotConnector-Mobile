import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    description: {
      marginBottom: 12,
      color: theme.colors.onSurfaceVariant,
    },
    empty: {
      marginBottom: 8,
      color: theme.colors.onSurfaceVariant,
    },
    providerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      marginBottom: 8,
    },
    providerText: {
      flex: 1,
    },
    providerLabel: {
      color: theme.colors.onSurface,
    },
    providerDetail: {
      marginTop: 2,
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    chevron: {
      marginLeft: 8,
      fontSize: 18,
      color: theme.colors.onSurfaceVariant,
    },
    addRow: {
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    addLabel: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
  });
};
