import React, {useContext} from 'react';
import {View, TouchableOpacity, Image, Alert} from 'react-native';

import {observer} from 'mobx-react-lite';
import {useNavigation} from '@react-navigation/native';
import {Text, Card, IconButton} from 'react-native-paper';

import {
  StarIcon,
  ChatIcon,
  CameraIcon,
  TrashIcon,
  ShareIcon,
} from '../../../../assets/icons';

import {useTheme} from '../../../../hooks';

import {ModelArtwork} from '../../../../components/ModelArtwork';

import {createStyles} from './styles';

import type {Pal} from '../../../../store/PalStore';
import {palStore} from '../../../../store/PalStore';
import {chatSessionStore, modelStore} from '../../../../store';

import {L10nContext} from '../../../../utils';
import {t} from '../../../../locales';
import {exportPal} from '../../../../utils/exportUtils';
import {ROUTES} from '../../../../utils/navigationConstants';
import {getContrastColor} from '../../../../utils/colorUtils';
import {getFullThumbnailUri} from '../../../../utils/imageUtils';
import {hasVideoCapability} from '../../../../utils/pal-capabilities';

interface SquarePalCardProps {
  pal: Pal;
  onPress: () => void;
}

const generateParameterSummary = (pal: Pal): string => {
  // Safety check for parameters
  if (!pal.parameters || typeof pal.parameters !== 'object') {
    return '';
  }

  // Generate a generic summary from any parameters
  const paramEntries = Object.entries(pal.parameters).filter(
    ([_, value]) => value && typeof value === 'string' && value.trim() !== '',
  );

  if (paramEntries.length === 0) {
    return '';
  }

  // Take the first few meaningful parameters and create a summary
  const meaningfulParams = paramEntries.slice(0, 3);
  return meaningfulParams.map(([_, value]) => value).join(' • ');
};

const cleanSystemPrompt = (systemPrompt: string): string => {
  // Safety check for undefined or null values
  if (!systemPrompt || typeof systemPrompt !== 'string') {
    return '';
  }

  // Remove common prefixes and clean up the prompt for display
  let cleaned = systemPrompt
    .replace(/^You are\s+/i, '')
    .replace(/^You're\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove technical instructions at the end
  cleaned = cleaned.replace(
    /\.\s*(Use few words|Be concise|If unsure, say so clearly).*$/i,
    '',
  );

  return cleaned;
};

const getDisplayContent = (pal: Pal): string => {
  if (pal.description) {
    return pal.description;
  }

  const summary = generateParameterSummary(pal);
  if (summary) {
    return summary;
  }

  if (pal.systemPrompt) {
    return cleanSystemPrompt(pal.systemPrompt);
  }

  // Fallback based on capabilities
  if (hasVideoCapability(pal)) {
    return 'Video AI Assistant';
  }

  if (pal.capabilities && Object.keys(pal.capabilities).length > 0) {
    return 'Advanced AI Assistant';
  }

  return 'AI Assistant';
};

const PalThumbnail: React.FC<{
  pal: Pal;
  onChatPress: () => void;
}> = ({pal, onChatPress}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  // Get thumbnail image URL - convert relative paths to full URIs for Image component
  const thumbnailUrl = pal.thumbnail_url
    ? getFullThumbnailUri(pal.thumbnail_url)
    : undefined;

  const palColors = pal.color;
  const gradientColors =
    Array.isArray(palColors) && palColors.length >= 2
      ? palColors
      : ['#333333', '#e5e5e6']; // Default colors

  const gradientStyle = palColors
    ? {
        backgroundColor: gradientColors[0],
      }
    : {};

  const thumbnailStyle = [styles.thumbnail, gradientStyle];

  const textColor = palColors
    ? getContrastColor(gradientColors[0])
    : theme.colors.onPrimaryContainer;

  return (
    <View style={thumbnailStyle}>
      {thumbnailUrl ? (
        <Image
          source={{uri: thumbnailUrl}}
          style={styles.thumbnailImage}
          resizeMode="cover"
        />
      ) : (
        <ModelArtwork
          metadata={null}
          size={40}
          color={textColor}
          testID={`pal-artwork-${pal.id}`}
        />
      )}

      {/* Chat Navigation Button */}
      <TouchableOpacity
        style={styles.chatButton}
        hitSlop={8}
        onPress={onChatPress}
        accessibilityRole="button"
        accessibilityLabel={t(l10n.palsScreen.chatWith, {name: pal.name})}>
        {hasVideoCapability(pal) ? (
          <CameraIcon stroke={theme.colors.primary} width={18} height={18} />
        ) : (
          <ChatIcon stroke={theme.colors.primary} width={18} height={18} />
        )}
      </TouchableOpacity>
    </View>
  );
};

export const SquarePalCard: React.FC<SquarePalCardProps> = observer(
  ({pal, onPress}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const navigation = useNavigation();

    // Warn when the pal's default model is not downloaded.
    const shouldShowModelWarning =
      pal.defaultModel && !modelStore.isModelAvailable(pal.defaultModel.id);

    // 3-step pal activation logic from ChatPalModelPickerSheet
    const handleStartChat = async () => {
      try {
        // Step 1: Set the pal as active
        await chatSessionStore.setActivePal(pal.id);

        // Step 2 & 3: Handle model loading logic
        if (pal.defaultModel) {
          if (!modelStore.activeModel) {
            // Step 2: No model loaded, load the pal's default model
            const palDefaultModel = modelStore.availableModels.find(
              m => m.id === pal.defaultModel?.id,
            );
            if (palDefaultModel) {
              await modelStore.selectModel(palDefaultModel);
            }
          } else if (pal.defaultModel.id !== modelStore.activeModelId) {
            // Step 3: Different model loaded, ask user
            const palDefaultModel = modelStore.availableModels.find(
              m => m.id === pal.defaultModel?.id,
            );
            if (palDefaultModel) {
              Alert.alert(
                'Switch Model?',
                `Switch to "${palDefaultModel.name}" for this persona?`,
                [
                  {text: 'Keep Current', style: 'cancel'},
                  {
                    text: 'Switch',
                    onPress: () => {
                      modelStore.selectModel(palDefaultModel);
                    },
                  },
                ],
              );
            }
          }
        }

        // Navigate to chat
        (navigation as any).navigate(ROUTES.CHAT);
      } catch (error) {
        console.error('Error starting chat:', error);
        Alert.alert('Error', 'Failed to start chat. Please try again.');
      }
    };

    const handleDelete = () => {
      Alert.alert(
        l10n.palsScreen.deletePal,
        t(l10n.palsScreen.deletePalConfirmation, {palName: pal.name}),
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: () => palStore.deletePal(pal.id),
          },
        ],
      );
    };

    const handleShare = async () => {
      try {
        await exportPal(pal.id);
      } catch (error) {
        console.error('Error sharing pal:', error);
        Alert.alert(
          'Share Error',
          'Failed to share this persona. Please try again.',
          [{text: 'OK'}],
        );
      }
    };

    const palColors = pal.color;

    // Create card style with optional color theming
    const cardStyle = [
      styles.card,
      palColors && {
        borderColor: palColors[1],
        borderWidth: 0.5,
      },
    ];

    return (
      <View style={styles.cardOuter}>
        <TouchableOpacity
          testID={`local-pal-card-${pal.id}`}
          style={styles.container}
          onPress={onPress}
          activeOpacity={0.7}>
          <Card elevation={0} style={cardStyle} contentStyle={styles.cardInner}>
            <View style={styles.cardContent}>
              {/* Thumbnail */}
              <PalThumbnail pal={pal} onChatPress={handleStartChat} />

              {/* Content */}
              <View style={styles.content}>
                {/* Header with name and actions */}
                <View style={styles.header}>
                  <View style={styles.nameSection}>
                    <Text style={styles.palName} numberOfLines={1}>
                      {pal.name}
                    </Text>
                  </View>

                  {/* Action buttons */}
                  <View style={styles.headerActions}>
                    <IconButton
                      icon={() => (
                        <ShareIcon
                          stroke={theme.colors.onSurface}
                          width={16}
                          height={16}
                        />
                      )}
                      size={20}
                      style={styles.actionButton}
                      accessibilityLabel={`${l10n.common.export} ${pal.name}`}
                      onPress={handleShare}
                    />

                    <IconButton
                      icon={() => (
                        <TrashIcon
                          stroke={theme.colors.error}
                          width={16}
                          height={16}
                        />
                      )}
                      size={20}
                      style={styles.actionButton}
                      accessibilityLabel={`${l10n.common.delete} ${pal.name}`}
                      onPress={handleDelete}
                    />
                  </View>
                </View>

                {/* Middle content */}
                <View style={styles.middleContent}>
                  {/* Description */}
                  {(() => {
                    const displayContent = getDisplayContent(pal);
                    return displayContent ? (
                      <Text
                        style={styles.description}
                        numberOfLines={shouldShowModelWarning ? 1 : 2}>
                        {displayContent}
                      </Text>
                    ) : null;
                  })()}

                  {/* Model Warning */}
                  {shouldShowModelWarning ? (
                    <View style={styles.warningContainer}>
                      <IconButton
                        icon="alert-circle-outline"
                        iconColor={theme.colors.error}
                        size={14}
                        style={styles.warningIcon}
                        accessible={false}
                        importantForAccessibility="no"
                      />
                      <Text style={styles.warningText} numberOfLines={1}>
                        {
                          l10n.components.modelNotAvailable
                            .modelNotDownloadedShort
                        }
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Footer with rating */}
                <View style={styles.footer}>
                  <View style={styles.leftFooter}>
                    {pal.rating ? (
                      <View style={styles.ratingContainer}>
                        <StarIcon
                          stroke={theme.colors.tertiary}
                          fill={theme.colors.tertiary}
                          width={12}
                          height={12}
                        />
                        <Text style={styles.rating}>
                          {pal.rating.toFixed(1)}
                        </Text>
                        {pal.review_count ? (
                          <Text style={styles.reviewCount}>
                            ({pal.review_count})
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      </View>
    );
  },
);
