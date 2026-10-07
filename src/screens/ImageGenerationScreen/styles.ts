import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    keyboardAvoiding: {
      flex: 1,
    },
    container: {
      padding: theme.spacing.default,
      paddingBottom: theme.spacing.default * 3,
      gap: theme.spacing.default,
    },
    connectContainer: {
      flex: 1,
      padding: theme.spacing.default,
      gap: theme.spacing.default,
    },
    field: {
      gap: theme.spacing.default / 2,
    },
    fieldHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.default / 2,
    },
    metaText: {
      flexShrink: 1,
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'right',
    },
    stateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.default / 2,
      paddingVertical: theme.spacing.default / 3,
    },
    modelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.default / 2,
    },
    modelDropdown: {
      flex: 1,
    },
    emptyModels: {
      gap: theme.spacing.default / 2,
      paddingVertical: theme.spacing.default / 2,
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
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.default / 2,
    },
    sectionTitleCluster: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flex: 1,
      minWidth: 0,
      gap: theme.spacing.default / 2,
    },
    countText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 16,
    },
    referenceHint: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 17,
    },
    referenceList: {
      gap: theme.spacing.default / 2,
      paddingTop: theme.spacing.default / 4,
    },
    referenceItem: {
      width: 72,
      height: 72,
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
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.default / 2,
      padding: theme.spacing.default * 0.75,
      borderRadius: theme.borders.default,
      backgroundColor: theme.colors.errorContainer,
    },
    errorText: {
      flex: 1,
      color: theme.colors.onErrorContainer,
      lineHeight: 20,
    },
    resultCard: {
      gap: theme.spacing.default * 0.75,
      padding: theme.spacing.default * 0.75,
      borderRadius: theme.borders.default,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.surfaceVariant,
    },
    resultImage: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: theme.borders.default,
      backgroundColor: theme.colors.surfaceContainerHighest,
    },
    resultFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.default / 2,
    },
    resultMeta: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    muted: {
      color: theme.colors.onSurfaceVariant,
      lineHeight: 21,
    },
    centerState: {
      flex: 1,
      justifyContent: 'center',
      padding: theme.spacing.default * 2,
      gap: theme.spacing.default,
    },
  });
