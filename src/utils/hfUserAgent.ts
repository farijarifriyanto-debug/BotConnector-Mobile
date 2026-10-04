import DeviceInfo from 'react-native-device-info';

/**
 * User-Agent for outbound Hugging Face requests (API + model downloads).
 * The `(id.botconnector.app)` token is a fixed attribution key on both platforms.
 */
export const hfUserAgent = (): string =>
  `BotConnector/${DeviceInfo.getVersion()} (id.botconnector.app)`;
