import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) => {
  const gap = theme.spacing.default;
  const card = {
    gap: gap * 0.75,
    padding: gap,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  } as const;
  const pill = {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surface,
  } as const;

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    keyboardAvoiding: {
      flex: 1,
    },
    container: {
      padding: gap,
      paddingBottom: gap * 4,
      gap: gap * 1.25,
    },
    connectContainer: {
      flex: 1,
      padding: gap,
      gap,
    },
    centerState: {
      flex: 1,
      justifyContent: 'center',
      padding: gap * 2,
      gap,
    },

    // ---- hero
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: gap * 0.75,
      padding: gap * 1.25,
      borderRadius: 28,
      backgroundColor: theme.colors.primaryContainer,
      overflow: 'hidden',
    },
    heroText: {
      flex: 1,
      gap: 6,
    },
    heroTitle: {
      color: theme.colors.onPrimaryContainer,
      fontWeight: '700',
    },
    heroSubtitle: {
      color: theme.colors.onPrimaryContainer,
      opacity: 0.8,
      fontSize: 13,
      lineHeight: 18,
    },
    quotaPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
    },
    quotaPillText: {
      flexShrink: 1,
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.onSurface,
    },

    // ---- cards and sections
    card,
    field: {
      gap: gap * 0.6,
    },
    fieldHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: gap / 2,
    },
    sectionLabel: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
    },
    muted: {
      color: theme.colors.onSurfaceVariant,
      lineHeight: 21,
    },
    countText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 16,
    },
    promptCount: {
      alignSelf: 'flex-end',
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.onSurfaceVariant,
    },
    promptCountWarn: {
      color: theme.colors.error,
    },

    // ---- pills (style + examples)
    pillRow: {
      flexDirection: 'row',
      gap: gap / 2,
      paddingVertical: 2,
      paddingRight: gap,
    },
    pill,
    pillSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    pillText: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.onSurface,
    },
    pillTextSelected: {
      color: theme.colors.onPrimary,
      fontWeight: '600',
    },
    examplePill: {
      maxWidth: 260,
      backgroundColor: theme.colors.surfaceContainerHighest,
      borderColor: 'transparent',
    },

    // ---- reference photos
    referenceHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: gap / 2,
    },
    referenceHint: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 17,
    },
    referenceList: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: gap / 2,
      paddingVertical: 4,
      paddingRight: gap,
    },
    addTile: {
      width: 76,
      height: 76,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
    },
    addTileDisabled: {
      opacity: 0.4,
      borderColor: theme.colors.outline,
    },
    addTileText: {
      fontSize: 11,
      lineHeight: 14,
      color: theme.colors.primary,
      fontWeight: '600',
    },
    referenceItem: {
      width: 76,
      height: 76,
      borderRadius: 18,
      overflow: 'visible',
      backgroundColor: theme.colors.surfaceContainerHighest,
    },
    referenceImage: {
      width: '100%',
      height: '100%',
      borderRadius: 18,
    },
    referenceRemove: {
      position: 'absolute',
      top: -10,
      right: -10,
      margin: 0,
      backgroundColor: theme.colors.surface,
    },

    // ---- model + shape
    modelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: gap / 2,
    },
    modelDropdown: {
      flex: 1,
    },
    emptyModels: {
      gap: gap / 2,
      paddingVertical: gap / 2,
    },
    stateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: gap / 2,
      paddingVertical: gap / 3,
    },
    metaCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      flexShrink: 1,
      gap: gap / 2,
    },
    metaText: {
      flexShrink: 1,
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'right',
    },
    accessBadge: {
      margin: 0,
      minHeight: 28,
    },
    ratioRow: {
      flexDirection: 'row',
      gap: gap * 0.6,
    },

    // ---- primary action + progress
    generateButton: {
      borderRadius: 20,
    },
    generateContent: {
      minHeight: 56,
    },
    generateLabel: {
      fontSize: 16,
      fontWeight: '700',
    },
    progressCard: {
      ...card,
      backgroundColor: theme.colors.surfaceContainerHighest,
      borderColor: 'transparent',
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: gap * 0.6,
    },
    progressTitle: {
      flex: 1,
      fontWeight: '600',
    },
    progressTime: {
      color: theme.colors.onSurfaceVariant,
      fontVariant: ['tabular-nums'],
    },
    cancelButton: {
      borderRadius: 16,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: gap / 2,
      padding: gap * 0.75,
      borderRadius: 18,
      backgroundColor: theme.colors.errorContainer,
    },
    errorText: {
      flex: 1,
      color: theme.colors.onErrorContainer,
      lineHeight: 20,
    },

    // ---- result
    resultCard: {
      ...card,
      padding: gap * 0.6,
      gap: gap * 0.75,
    },
    resultImage: {
      width: '100%',
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceContainerHighest,
    },
    resultMeta: {
      gap: 2,
      paddingHorizontal: gap * 0.4,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: gap / 2,
      paddingHorizontal: gap * 0.4,
      paddingBottom: gap * 0.4,
    },
    actionPill: {
      borderRadius: 16,
    },

    // ---- history gallery
    emptyHistory: {
      alignItems: 'center',
      gap: gap / 2,
      padding: gap * 1.5,
      borderRadius: 20,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.colors.outlineVariant,
    },
    historyGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: gap / 2,
    },
    historyCell: {
      width: '31.5%',
      aspectRatio: 1,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: 'transparent',
      backgroundColor: theme.colors.surfaceContainerHighest,
    },
    historyThumbSelected: {
      borderColor: theme.colors.primary,
    },
    historyThumb: {
      width: '100%',
      height: '100%',
    },
    historyStar: {
      position: 'absolute',
      top: 5,
      right: 5,
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      padding: 3,
    },
    historyActions: {
      gap: gap / 2,
      padding: gap * 0.75,
      borderRadius: 20,
      backgroundColor: theme.colors.surfaceContainerHighest,
    },
    historyPrompt: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 13,
      lineHeight: 18,
    },
  });
};
