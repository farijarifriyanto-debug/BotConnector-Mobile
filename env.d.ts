declare const __E2E__: boolean;
declare const __E2E_SKIP_ONBOARDING__: boolean;

declare module '@env' {
  export const FIREBASE_FUNCTIONS_URL: string;
  export const APPCHECK_DEBUG_TOKEN_ANDROID: string;
  export const APPCHECK_DEBUG_TOKEN_IOS: string;

  // App Configuration
  export const APP_URL: string;

  // Feature Flags
  export const ENABLE_AUTHENTICATION: string;
  export const ENABLE_OFFLINE_MODE: string;
}
