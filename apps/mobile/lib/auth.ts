import * as SecureStore from "expo-secure-store";

/**
 * The auth token lives in the device keychain via SecureStore — the right
 * place for secrets, encrypted at rest. We cache it in memory too so the API
 * helper can attach it synchronously without an async read per request.
 */
const TOKEN_KEY = "coplate_auth_token";

let cachedToken: string | null = null;

export async function loadToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export async function saveToken(token: string): Promise<void> {
  cachedToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Synchronous read of the in-memory cache, for attaching to requests. */
export function getCachedToken(): string | null {
  return cachedToken;
}
