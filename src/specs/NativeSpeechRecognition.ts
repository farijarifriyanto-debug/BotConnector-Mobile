import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  recognizeOnce(locale: string): Promise<string>;
  cancel(): void;
}

export default TurboModuleRegistry.get<Spec>('SpeechRecognitionModule');
