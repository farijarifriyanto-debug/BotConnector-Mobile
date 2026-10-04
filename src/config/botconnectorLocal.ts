export const BOTCONNECTOR_LOCAL_NAME = 'BotConnector Local';
export const BOTCONNECTOR_LOCAL_DEFAULT_PORT = 1337;

export const isBotConnectorLocalServerName = (name: string): boolean =>
  name === BOTCONNECTOR_LOCAL_NAME ||
  name.startsWith(`${BOTCONNECTOR_LOCAL_NAME} · `);

export const botConnectorLocalServerName = (rawUrl: string): string => {
  try {
    const hostname = new URL(rawUrl).hostname;
    return hostname
      ? `${BOTCONNECTOR_LOCAL_NAME} · ${hostname}`
      : BOTCONNECTOR_LOCAL_NAME;
  } catch {
    return BOTCONNECTOR_LOCAL_NAME;
  }
};
