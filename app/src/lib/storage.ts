// Local key-value storage backed by SQLite.
// Sensitive values (Supabase session, onboarding draft, offline cache and queue) are encrypted
// with AES-256 and a random key kept in the iOS Keychain / Android Keystore (expo-secure-store);
// preferences (language, theme, intro seen) stay plain. Legacy plain values are re-encrypted on
// first read (no sign-out).
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { SQLiteStorage } from 'expo-sqlite/kv-store';

import { decryptValue, encryptValue, isEncrypted } from './cryptoBox';

export const storage = new SQLiteStorage('daily-edge-kv.db');

export const storageKeys = {
  introSeen: 'pref.introSeen',
  language: 'pref.language',
  onboardingDraft: (userId: string) => `onboarding.draft.${userId}`,
} as const;

const KEY_NAME = 'daily-edge.storage-key';
let cachedKey: Uint8Array | null = null;

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{2}/g) ?? []).map((h) => Number.parseInt(h, 16)));

// Random 256-bit key created once, stored in the secure store (never in SQLite)
function encryptionKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  let hex = SecureStore.getItem(KEY_NAME);
  if (!hex) {
    hex = toHex(Crypto.getRandomBytes(32));
    SecureStore.setItem(KEY_NAME, hex, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  }
  cachedKey = fromHex(hex);
  return cachedKey;
}

export function readSecure(key: string): string | null {
  const raw = storage.getItemSync(key);
  if (raw === null) return null;
  if (!isEncrypted(raw)) {
    // Legacy plain value: re-encrypted now
    writeSecure(key, raw);
    return raw;
  }
  try {
    return decryptValue(raw, encryptionKey());
  } catch {
    return null;
  }
}

export function writeSecure(key: string, value: string): void {
  storage.setItemSync(key, encryptValue(value, encryptionKey(), Crypto.getRandomBytes(16)));
}

// Adapter expected by supabase-js (session encrypted at rest)
export const supabaseAuthStorage = {
  getItem: async (key: string) => readSecure(key),
  setItem: async (key: string, value: string) => writeSecure(key, value),
  removeItem: async (key: string) => {
    await storage.removeItemAsync(key);
  },
};

export function readJson<T>(key: string): T | null {
  try {
    const raw = readSecure(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeSecure(key, JSON.stringify(value));
}
