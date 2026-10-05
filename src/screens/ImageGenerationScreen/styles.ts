import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      padding: theme.spacing.default,
      paddingBottom: theme.spacing.default * 3,
      gap: theme.spacing.default * 1.25,
    },
    intro: {
      color: theme.colors.onSurfaceVariant,
      lineHeight: 21,
    },
    field: {
      gap: theme.spacing.default / 2,
    },
    modelMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.default / 2,
    },
    emptyModels: {
      gap: theme.spacing.default / 2,
      paddingVertical: theme.spacing.default,
    },
    resultCard: {
      gap: theme.spacing.default,
      padding: theme.spacing.default,
      borderRadius: theme.borders.default,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.surfaceVariant,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.default,
    },
    resultImage: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: theme.borders.default,
      backgroundColor: theme.colors.surfaceContainerHighest,
    },
    muted: {
      color: theme.colors.onSurfaceVariant,
      lineHeight: 21,
    },
    error: {
      color: theme.colors.error,
      lineHeight: 21,
    },
    centerState: {
      flex: 1,
      justifyContent: 'center',
      padding: theme.spacing.default * 2,
      gap: theme.spacing.default,
    },
  });
