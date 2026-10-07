import React, {useContext} from 'react';
import {Image, ImageStyle, StyleProp} from 'react-native';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

export type BicoMascotVariant = 'auto' | 'hero' | 'mark' | 'mono';

export interface BicoMascotProps {
  /**
   * `auto` (default): full-body hero on light surfaces, round mark on dark.
   * The hero is light-surface only — its edges rasterize against dark
   * backgrounds — so an explicit `hero` also falls back to `mark` in dark
   * mode. `mono` is the black template image meant for tinting via style.
   */
  variant?: BicoMascotVariant;
  /** Width in points; height keeps the asset's own aspect ratio. */
  width?: number;
  /**
   * Decorative (default) hides the image from VoiceOver. Pass `false` for
   * the informative case, which announces the localized mascot label.
   */
  decorative?: boolean;
  style?: StyleProp<ImageStyle>;
  testID?: string;
}

const hero = require('../../assets/bico/bico-hero.png');
const mark = require('../../assets/bico/bico-mark.png');
const mono = require('../../assets/bico/bico-mono.png');

const SOURCES = {hero, mark, mono};

export const BicoMascot: React.FC<BicoMascotProps> = ({
  variant = 'auto',
  width = 96,
  decorative = true,
  style,
  testID = 'bico-mascot',
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const isDark = theme.dark;

  let resolved: 'hero' | 'mark' | 'mono';
  if (variant === 'auto') {
    resolved = isDark ? 'mark' : 'hero';
  } else if (variant === 'hero' && isDark) {
    resolved = 'mark';
  } else {
    resolved = variant;
  }

  const source = SOURCES[resolved];
  const aspect =
    source?.height && source?.width ? source.height / source.width : 1;
  const height = Math.round(width * aspect);

  const a11yProps = decorative
    ? {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
        accessible: false,
      }
    : {
        accessible: true,
        accessibilityRole: 'image' as const,
        accessibilityLabel: l10n.bico.mascotLabel,
      };

  return (
    <Image
      source={source}
      style={[{width, height}, style]}
      resizeMode="contain"
      testID={testID}
      {...a11yProps}
    />
  );
};
