import {BotConnectorClientCapabilities} from '../api/botconnectorAccess';
import {isBotConnectorApiUrl} from '../config/botconnector';
import {isBotConnectorLocalServerName} from '../config/botconnectorLocal';
import {isLocalHost} from './network';
import {Model, ModelOrigin, ServerConfig} from './types';
import {profileFor} from '../api/servers';

export type RichFeatureAccess = 'full' | 'chat_only';

export function resolveRichFeatureAccess(
  model: Model | undefined,
  servers: ServerConfig[],
  botConnectorAccess: Record<string, BotConnectorClientCapabilities>,
): RichFeatureAccess {
  if (!model || model.origin !== ModelOrigin.REMOTE) {
    return 'full';
  }

  const serverId = model.serverId;
  if (!serverId) {
    return 'chat_only';
  }
  const server = servers.find(item => item.id === serverId);
  if (!server) {
    return 'chat_only';
  }

  if (isBotConnectorApiUrl(server.url)) {
    // Per-axis contract: never gate on the legacy coarse `access` flag.
    // "Rich" means at least one non-chat axis is actually enabled; a
    // not-yet-loaded placeholder reports none, so it stays chat-only until
    // the real capabilities land.
    const caps = botConnectorAccess[server.id]?.capabilities;
    if (!caps) {
      return 'chat_only';
    }
    const anyRichAxis = (
      ['web_search', 'read_url', 'tools', 'vision', 'media', 'files'] as const
    ).some(axis => caps[axis] === true);
    return anyRichAxis ? 'full' : 'chat_only';
  }

  if (isBotConnectorLocalServerName(server.name)) {
    return 'full';
  }

  if (profileFor(server.serverType).isLocalRuntime || isLocalHost(server.url)) {
    return 'full';
  }

  return 'chat_only';
}

export function richFeaturesAllowed(
  model: Model | undefined,
  servers: ServerConfig[],
  botConnectorAccess: Record<string, BotConnectorClientCapabilities>,
): boolean {
  return (
    resolveRichFeatureAccess(model, servers, botConnectorAccess) === 'full'
  );
}
