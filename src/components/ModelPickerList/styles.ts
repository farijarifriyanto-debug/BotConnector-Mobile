import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      marginBottom: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      paddingVertical: 10,
      color: theme.colors.onSurface,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: theme.colors.onSurfaceVariant,
      marginTop: 14,
      marginBottom: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      gap: 10,
    },
    rowActive: {
      backgroundColor: theme.colors.primaryContainer,
    },
    rowPressed: {
      opacity: 0.6,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '500',
      color: theme.colors.onSurface,
    },
    rowTitleActive: {
      color: theme.colors.onPrimaryContainer,
    },
    rowSubtitle: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.onSurfaceVariant,
      marginTop: 1,
    },
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 5,
    },
    badge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
    },
    accessBadge: {
      backgroundColor: theme.colors.surfaceVariant,
      borderColor: 'transparent',
    },
    badgeText: {
      fontSize: 10,
      lineHeight: 14,
      color: theme.colors.onSurfaceVariant,
    },
    notice: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 16,
    },
    noticeText: {
      fontSize: 14,
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
    },
    noticeButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderRadius: 22,
      backgroundColor: theme.colors.primary,
    },
    noticeButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.onPrimary,
    },
    emptyText: {
      fontSize: 14,
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
      paddingVertical: 16,
    },
    footnote: {
      fontSize: 11,
      lineHeight: 15,
      color: theme.colors.onSurfaceVariant,
      marginTop: 16,
      marginBottom: 8,
    },
  });
