import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

// Plain object (not via StyleSheet.create) because react-syntax-highlighter's
// customStyle is merged with Object.assign — a numeric StyleSheet id won't
// flatten the upstream white PreTag fallback. See MarkdownView for the why.
export const codeHighlighterPreOverride = {
  backgroundColor: 'transparent',
} as const;

// Chat-reading scale: body close to iOS body text, headings proportional, and
// explicit block margins (react-native-render-html's browser defaults give
// <p>/<ul> 16px margins and <h1> 32px, which made short answers fill a screen).
const BODY_SIZE = 16;
const BODY_LINE = 23;

const heading = (fontSize: number, lineHeight: number) => ({
  fontSize,
  lineHeight,
  fontWeight: '600' as const,
  marginTop: 14,
  marginBottom: 6,
});

export const createTagsStyles = (theme: Theme) => ({
  p: {
    marginTop: 0,
    marginBottom: 10,
  },
  h1: heading(20, 26),
  h2: heading(18, 24),
  h3: heading(17, 23),
  h4: heading(16, 22),
  h5: heading(16, 22),
  h6: heading(15, 21),
  ul: {
    marginTop: 0,
    marginBottom: 10,
    paddingLeft: 20,
  },
  ol: {
    marginTop: 0,
    marginBottom: 10,
    paddingLeft: 22,
  },
  li: {
    marginBottom: 4,
  },
  blockquote: {
    marginTop: 4,
    marginBottom: 10,
    marginLeft: 0,
    marginRight: 0,
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.outline,
    color: theme.colors.onSurfaceVariant,
  },
  hr: {
    marginTop: 12,
    marginBottom: 12,
    height: 1,
    backgroundColor: theme.colors.outline,
  },
  body: {
    color: theme.colors.text,
    fontSize: BODY_SIZE,
    lineHeight: BODY_LINE,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    padding: 0,
    paddingTop: 0,
    margin: 0,
    backgroundColor: 'transparent',
    // display: 'inline-block',
  },
  a: {
    color: theme.colors.secondary,
    textDecorationLine: 'underline' as const,
  },
  code: {
    fontFamily: 'Courier', // Change the font for code snippets
    backgroundColor: theme.colors.surface, // Custom background for code blocks
    padding: 4,
    borderRadius: 4,
    color: theme.colors.onSurface, // Color for code text
    fontSize: 12,
    whiteSpace: 'pre' as const,
  },
  pre: {
    backgroundColor: theme.colors.surface, // Background for pre blocks
    padding: 8,
    borderRadius: 6,
    marginVertical: 8,
    color: theme.colors.onPrimaryContainer,
    fontFamily: 'Courier',
    fontSize: 14,
    whiteSpace: 'pre' as const,
  },
  // Styles for thinking tags
  thinking: {
    color: theme.colors.thinkingBubbleText,
    fontSize: 14,
    lineHeight: 20,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  think: {
    color: theme.colors.thinkingBubbleText,
    fontSize: 14,
    lineHeight: 20,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  thought: {
    color: theme.colors.thinkingBubbleText,
    fontSize: 14,
    lineHeight: 20,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
});

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    markdownContainer: {
      // Dynamic maxWidth will be applied via style prop
    },
    codeHighlighterText: {
      fontFamily: 'Courier',
    },
    codeHighlighterScrollContent: {
      backgroundColor: theme.colors.surface,
      padding: 8,
      borderRadius: 6,
      marginTop: 4,
    },
  });
