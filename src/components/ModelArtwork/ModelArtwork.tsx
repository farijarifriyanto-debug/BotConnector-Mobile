import React from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import type {SvgProps} from 'react-native-svg';

import {AtomIcon, GoogleIcon} from '../../assets/icons';

import {
  resolveModelArtwork,
  type ArtworkMetadata,
} from '../../utils/modelArtwork';

/**
 * Bundled provider logos, keyed by `PROVIDER_ARTWORK_REGISTRY` key.
 * Providers without an asset fall back to the generic AI icon — never a
 * giant letter (spec I).
 */
const PROVIDER_LOGOS: Partial<Record<string, React.FC<SvgProps>>> = {
  google: GoogleIcon,
};

export interface ModelArtworkProps {
  /** Canonical metadata used to look the provider up in the registry. */
  metadata?: ArtworkMetadata | null;
  /** Width/height of the artwork square. */
  size?: number;
  /** Stroke color for the generic AI icon (logo colors stay canonical). */
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * Clean artwork slot for models/pals: provider logo when the registry has
 * one, otherwise a generic AI icon. Renders no text at all, so a giant
 * first-letter fallback is structurally impossible.
 */
export const ModelArtwork: React.FC<ModelArtworkProps> = ({
  metadata,
  size = 24,
  color,
  style,
  testID = 'model-artwork',
  accessibilityLabel,
}) => {
  const artwork = resolveModelArtwork(metadata);
  const Logo = artwork.providerKey
    ? PROVIDER_LOGOS[artwork.providerKey]
    : undefined;
  const label =
    accessibilityLabel ??
    (artwork.providerName ? `${artwork.providerName} logo` : 'AI artwork');

  return (
    <View
      testID={testID}
      style={[styles.container, {width: size, height: size}, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}>
      {Logo ? (
        <Logo width={size} height={size} />
      ) : (
        <AtomIcon width={size} height={size} stroke={color} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
