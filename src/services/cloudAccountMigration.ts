import {runInAction} from 'mobx';
import * as Keychain from 'react-native-keychain';

import {isBotConnectorApiUrl} from '../config/botconnector';
import {serverStore} from '../store/ServerStore';
import {uiStore} from '../store/UIStore';

// Keychain services written by the pre-2.1.0 native OAuth flow. The auth
// code is gone; these constants are the last place that names them.
const AUTH_SESSION_SERVICE = 'botconnector-native-auth-v1';
const LOGIN_PENDING_SERVICE = 'botconnector-native-login-pending-v1';

/**
 * One-time upgrade migration for 2.1.0 (Cloud account removal).
 *
 * A server pointing at api.botconnector.id was only useful while signed in.
 * Servers created by the OAuth flow are removed; a server the user typed in
 * manually (no OAuth session in the Keychain) is left alone — it is their
 * configuration, and the Keychain proof of OAuth is the only way to tell the
 * two apart after the fact.
 *
 * Chat history lives in WatermelonDB and is never touched.
 *
 * Idempotent: guarded by the persisted `uiStore.cloudAccountMigrated` flag.
 * Runs only after onboarding, so a fresh install (which never had a Cloud
 * account) flips the flag without doing any work.
 */
export async function runCloudAccountMigration(): Promise<void> {
  if (!uiStore.hasCompletedOnboarding || uiStore.cloudAccountMigrated) {
    return;
  }

  let hasOAuthSession = false;
  try {
    hasOAuthSession = Boolean(
      await Keychain.getGenericPassword({service: AUTH_SESSION_SERVICE}),
    );
  } catch {
    // A Keychain read failure must not delete servers we cannot prove came
    // from OAuth.
    hasOAuthSession = false;
  }

  if (hasOAuthSession) {
    const cloudServerIds = serverStore.servers
      .filter(server => isBotConnectorApiUrl(server.url))
      .map(server => server.id);
    for (const id of cloudServerIds) {
      serverStore.removeServer(id);
    }
  }

  // Best-effort cleanup. Leftover entries are inert (nothing reads them any
  // more), so a failed reset must not block the migration or crash startup.
  await Keychain.resetGenericPassword({service: AUTH_SESSION_SERVICE}).catch(
    () => {},
  );
  await Keychain.resetGenericPassword({service: LOGIN_PENDING_SERVICE}).catch(
    () => {},
  );

  runInAction(() => {
    uiStore.cloudAccountMigrated = true;
  });
}
