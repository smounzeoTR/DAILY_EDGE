// Offline mode at runtime: network state (NetInfo, also given to TanStack Query), encrypted
// queue per user, replay on reconnect and when the app comes back to the foreground, notices for
// the user (actions sent, actions refused).
import NetInfo from '@react-native-community/netinfo';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { readJson, storage, writeJson } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import { enqueue, replay, type HabitOp, type OfflineOp, type ResultOp } from './queue';

const queueKey = (userId: string) => `offline.queue.${userId}`;

export type SyncNotice = { applied: number; refused: number; at: string } | null;

type State = { online: boolean; pending: number; notice: SyncNotice };
let state: State = { online: true, pending: 0, notice: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

export function useOfflineState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function dismissSyncNotice() {
  set({ notice: null });
}

export function loadQueue(userId: string): OfflineOp[] {
  return readJson<OfflineOp[]>(queueKey(userId)) ?? [];
}

function saveQueue(userId: string, queue: OfflineOp[]) {
  if (queue.length === 0) storage.removeItemSync(queueKey(userId));
  else writeJson(queueKey(userId), queue);
  set({ pending: queue.length });
}

export function clearOfflineData(userId: string) {
  storage.removeItemSync(queueKey(userId));
  set({ pending: 0, notice: null });
}

export function queueAction(userId: string, op: ResultOp | HabitOp) {
  const full = {
    ...op,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  } as OfflineOp;
  saveQueue(userId, enqueue(loadQueue(userId), full));
}

async function run(userId: string, op: OfflineOp) {
  if (op.kind === 'result') {
    const { error } = await supabase.rpc('set_plan_item_result', {
      p_item_id: op.itemId,
      p_status: op.status,
      p_proof_value: op.proof ?? undefined,
      p_rating: op.rating ?? undefined,
    });
    return error;
  }
  const { error } =
    op.action === 'uncheck'
      ? await supabase
          .from('habit_logs')
          .delete()
          .eq('user_habit_id', op.habitId)
          .eq('date', op.date)
      : await supabase.from('habit_logs').upsert(
          {
            user_habit_id: op.habitId,
            user_id: userId,
            date: op.date,
            done: true,
            minimal: op.action === 'minimal',
          },
          { onConflict: 'user_habit_id,date' },
        );
  return error;
}

let syncing = false;

// Replays the queue; the server's data is loaded again afterwards
export async function syncNow(userId: string, queryClient: QueryClient) {
  const queue = loadQueue(userId);
  set({ pending: queue.length });
  if (syncing || queue.length === 0 || !state.online) return;
  syncing = true;
  try {
    const result = await replay(queue, (op) => run(userId, op));
    saveQueue(userId, result.remaining);
    if (result.applied > 0 || result.refused.length > 0) {
      set({
        notice: {
          applied: result.applied,
          refused: result.refused.length,
          at: new Date().toISOString(),
        },
      });
      for (const key of ['plan', 'habitLogs', 'doneDays', 'checkin']) {
        void queryClient.invalidateQueries({ queryKey: [key, userId] });
      }
    }
  } finally {
    syncing = false;
  }
}

// Network state for the app and TanStack Query; replay when the network or the app comes back
export function startOfflineSync(userId: string, queryClient: QueryClient): () => void {
  set({ pending: loadQueue(userId).length });
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)),
  );
  const unsubscribeNet = NetInfo.addEventListener((s) => {
    const online = s.isConnected !== false;
    const cameBack = online && !state.online;
    set({ online });
    if (cameBack) void syncNow(userId, queryClient);
  });
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') void syncNow(userId, queryClient);
  });
  void syncNow(userId, queryClient);
  return () => {
    unsubscribeNet();
    appState.remove();
  };
}

export function isOnline(): boolean {
  return state.online;
}
