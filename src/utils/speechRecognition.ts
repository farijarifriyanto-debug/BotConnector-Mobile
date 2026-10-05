import {PermissionsAndroid, Platform} from 'react-native';

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

  const locale = LOCALES[language] ?? language ?? 'en-US';
  return NativeSpeechRecognition.recognizeOnce(locale);
}

export function cancelSpeechRecognition(): void {
  NativeSpeechRecognition?.cancel();
}
