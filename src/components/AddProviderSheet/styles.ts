import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      padding: 16,
      paddingBottom: 32,
    },
    description: {
      marginBottom: 16,
      color: theme.colors.onSurface,
    },
    sectionLabel: {
      marginTop: 12,
      marginBottom: 8,
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    providerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      marginBottom: 8,
    },
    providerRowSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.secondaryContainer,
    },
    providerLabel: {
      flex: 1,
      color: theme.colors.onSurface,
    },
    configuredBadge: {
      fontSize: 12,
      color: theme.colors.primary,
      fontWeight: '600',
    },
    inputSpacing: {
      marginTop: 12,
    },
    hint: {
      marginTop: 6,
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    errorText: {
      marginTop: 8,
      color: theme.colors.error,
    },
    successText: {
      marginTop: 8,
      color: theme.colors.primary,
    },
    modelSection: {
      marginTop: 12,
    },
    modelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 4,
      borderRadius: 8,
    },
    modelLabel: {
      flex: 1,
      marginLeft: 4,
      color: theme.colors.onSurface,
    },
    removeButton: {
      marginTop: 4,
    },
    buttonsContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      width: '100%',
    },
    actionColumn: {
      flex: 1,
      alignItems: 'stretch',
    },
    saveButton: {
      marginTop: 4,
    },
  });
};
