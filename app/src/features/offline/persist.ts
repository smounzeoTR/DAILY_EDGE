// The data of Today is kept between launches (offline start): encrypted at rest, and limited to
// what Today needs (plan, habits, logs, today's check-in, profile, program labels).
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Query } from '@tanstack/react-query';

import { readSecure, storage, writeSecure } from '@/lib/storage';

export const PERSIST_KEY = 'offline.queryCache';
export const PERSIST_MAX_AGE = 3 * 24 * 60 * 60 * 1000;

const KEPT = new Set(['plan', 'userHabits', 'habitLogs', 'checkin', 'profile', 'premium']);

export function shouldPersistQuery(query: Query): boolean {
  const [first, second] = query.queryKey as unknown[];
  if (query.state.status !== 'success') return false;
  if (first === 'catalog') return second === 'programs' || second === 'programSteps';
  return typeof first === 'string' && KEPT.has(first);
}

export const queryPersister = createSyncStoragePersister({
  key: PERSIST_KEY,
  throttleTime: 2000,
  storage: {
    getItem: (key) => readSecure(key),
    setItem: (key, value) => writeSecure(key, value),
    removeItem: (key) => storage.removeItemSync(key),
  },
});
