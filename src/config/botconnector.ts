export const BOTCONNECTOR_NAME = 'BotConnector';
export const BOTCONNECTOR_API_BASE_URL = 'https://api.botconnector.id';

export const isBotConnectorApiUrl = (raw: string): boolean => {
  try {
    const parsed = new URL(raw);
    return (
      parsed.protocol === 'https:' && parsed.hostname === 'api.botconnector.id'
    );
  } catch {
    return false;
  }
};
