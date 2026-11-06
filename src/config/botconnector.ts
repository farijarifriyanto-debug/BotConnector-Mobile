/**
 * The one BotConnector-shaped thing 2.1.0 still needs: the upgrade migration
 * has to recognise the Cloud server created by the removed account flow.
 *
 * The name/base/timeout constants that went with the Cloud lane are gone; if a
 * screen needs a base URL it already has one from the BYOK preset list
 * (`src/api/byokProviders.ts`).
 */
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
