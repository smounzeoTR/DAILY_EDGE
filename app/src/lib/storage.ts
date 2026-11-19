// Local key-value storage backed by SQLite (session, onboarding draft, preferences).
// Not encrypted: to be re-evaluated in lot 8.
import { SQLiteStorage } from 'expo-sqlite/kv-store';

export const storage = new SQLiteStorage('daily-edge-kv.db');

export const storageKeys = {
  introSeen: 'pref.introSeen',
  language: 'pref.language',
  onboardingDraft: (userId: string) => `onboarding.draft.${userId}`,
} as const;

// Adapter expected by supabase-js
export const supabaseAuthStorage = {
  getItem: (key: string) => storage.getItemAsync(key),
  setItem: (key: string, value: string) => storage.setItemAsync(key, value),
  removeItem: async (key: string) => {
    await storage.removeItemAsync(key);
  },
};

export function readJson<T>(key: string): T | null {
  try {
    const raw = storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  storage.setItemSync(key, JSON.stringify(value));
}
