import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

import NativeSpeechRecognition from '../specs/NativeSpeechRecognition';

const LOCALES: Record<string, string> = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  id: 'id-ID',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ms: 'ms-MY',
  pt: 'pt-BR',
  ru: 'ru-RU',
  zh: 'zh-CN',
};

const LOCALE_TAG = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})+$/;

const primaryLanguage = (value?: string | null): string | undefined => {
  const primary = value?.split(/[-_]/)[0]?.toLowerCase();
  return primary || undefined;
};

/** Best-effort device locale (OS setting), independent of the in-app language. */
export function getDeviceLocale(): string | undefined {
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      const candidate = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
      return typeof candidate === 'string' ? candidate : undefined;
    }
    const candidate = NativeModules.I18nManager?.localeIdentifier;
    return typeof candidate === 'string'
      ? candidate.replace('_', '-')
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the speech-recognition locale. Speech should follow how the user
 * actually talks, so the device locale wins, then the in-app language, then
 * any raw BCP-47 tag that looks usable, and finally en-US. Pure: the caller
 * injects the device locale (see `getDeviceLocale`).
 */
export function resolveSpeechLocale(
  appLanguage?: string,
  deviceLocale?: string,
): string {
  const device = deviceLocale;
  const devicePrimary = primaryLanguage(device);
  if (devicePrimary && LOCALES[devicePrimary]) {
    return LOCALES[devicePrimary];
  }
  const appPrimary = primaryLanguage(appLanguage);
  if (appPrimary && LOCALES[appPrimary]) {
    return LOCALES[appPrimary];
  }
  if (device && LOCALE_TAG.test(device)) {
    return device.replace('_', '-');
  }
  if (appLanguage && LOCALE_TAG.test(appLanguage)) {
    return appLanguage.replace('_', '-');
  }
  return 'en-US';
}

export async function recognizeSpeechOnce(language: string): Promise<string> {
  if (!NativeSpeechRecognition) {
    throw new Error('Speech recognition is not available in this build.');
  }

  if (Platform.OS === 'android') {
    const permission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone access',
        message:
          'BotConnector uses the microphone only when you choose voice input.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Microphone permission was not granted.');
    }
  }

  const locale = resolveSpeechLocale(language, getDeviceLocale());
  return NativeSpeechRecognition.recognizeOnce(locale);
}

export function cancelSpeechRecognition(): void {
  NativeSpeechRecognition?.cancel();
}
