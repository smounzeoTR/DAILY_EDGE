// Offline queue of the actions of the day (pure): exercise results and habit checks made without
// network, replayed in order when it comes back. The server stays the source of truth: a refused
// replay is dropped and reported, never forced.
export type ResultOp = {
  kind: 'result';
  itemId: string;
  status: 'done' | 'skipped' | 'too_hard';
  proof: string | null;
  rating: number | null;
};
export type HabitOp = {
  kind: 'habit';
  habitId: string;
  date: string;
  action: 'check' | 'minimal' | 'uncheck';
};
export type OfflineOp = (ResultOp | HabitOp) & { id: string; createdAt: string };

// Same item or same habit and day: the latest action wins
export const opKey = (op: ResultOp | HabitOp) =>
  op.kind === 'result' ? `result:${op.itemId}` : `habit:${op.habitId}:${op.date}`;

export function enqueue(queue: OfflineOp[], op: OfflineOp): OfflineOp[] {
  const key = opKey(op);
  return [...queue.filter((o) => opKey(o) !== key), op];
}

export type ErrorKind = 'network' | 'refused';

// No answer from the server (offline, timeout): kept for later; any answer from the server
// (day closed, item gone, rights): refused
export function classifyError(error: {
  message?: string;
  code?: string;
  status?: number;
}): ErrorKind {
  const message = (error.message ?? '').toLowerCase();
  if (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('network error') ||
    message.includes('timeout') ||
    error.status === 0
  ) {
    return 'network';
  }
  return 'refused';
}

export type RefusedOp = { op: OfflineOp; reason: string };

export type ReplayResult = { remaining: OfflineOp[]; applied: number; refused: RefusedOp[] };

// Replays in order; stops at the first network failure (the rest waits for the next attempt)
export async function replay(
  queue: OfflineOp[],
  run: (op: OfflineOp) => Promise<{ message?: string; code?: string; status?: number } | null>,
): Promise<ReplayResult> {
  let applied = 0;
  const refused: RefusedOp[] = [];
  for (const [index, op] of queue.entries()) {
    let error: { message?: string; code?: string; status?: number } | null;
    try {
      error = await run(op);
    } catch (e) {
      error = { message: e instanceof Error ? e.message : String(e) };
    }
    if (!error) {
      applied += 1;
      continue;
    }
    if (classifyError(error) === 'network') {
      return { remaining: queue.slice(index), applied, refused };
    }
    refused.push({ op, reason: error.message ?? 'refused' });
  }
  return { remaining: [], applied, refused };
}
