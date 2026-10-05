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
    referenceSection: {
      gap: theme.spacing.default / 2,
      padding: theme.spacing.default,
      borderRadius: theme.borders.default,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.surfaceVariant,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.spacing.default,
    },
    sectionHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    referenceHint: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
    },
    referenceList: {
      gap: theme.spacing.default / 2,
      paddingTop: theme.spacing.default / 2,
    },
    referenceItem: {
      width: 92,
      height: 92,
      borderRadius: theme.borders.default,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceContainerHighest,
    },
    referenceImage: {
      width: '100%',
      height: '100%',
    },
    referenceRemove: {
      position: 'absolute',
      top: -6,
      right: -6,
      backgroundColor: theme.colors.surface,
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
