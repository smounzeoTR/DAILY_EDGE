import { describe, expect, it } from 'vitest';

import { classifyError, enqueue, replay, type OfflineOp } from './queue';

const habit = (
  id: string,
  action: 'check' | 'uncheck' | 'minimal',
  date = '2026-11-23',
): OfflineOp => ({
  id: `${id}-${action}-${Math.random()}`,
  createdAt: '2026-11-23T08:00:00Z',
  kind: 'habit',
  habitId: id,
  date,
  action,
});
const result = (itemId: string, status: 'done' | 'skipped'): OfflineOp => ({
  id: `${itemId}-${status}`,
  createdAt: '2026-11-23T08:00:00Z',
  kind: 'result',
  itemId,
  status,
  proof: status === 'done' ? 'Fait' : null,
  rating: null,
});

describe('offline queue', () => {
  it('keeps the order and the latest action for the same habit and day', () => {
    let q: OfflineOp[] = [];
    q = enqueue(q, habit('h1', 'check'));
    q = enqueue(q, result('i1', 'done'));
    q = enqueue(q, habit('h1', 'uncheck'));
    q = enqueue(q, habit('h1', 'check', '2026-11-22'));
    expect(
      q.map((o) => (o.kind === 'habit' ? `${o.habitId}:${o.date}:${o.action}` : `r:${o.itemId}`)),
    ).toEqual(['r:i1', 'h1:2026-11-23:uncheck', 'h1:2026-11-22:check']);
  });

  it('the latest result of an item wins', () => {
    const q = enqueue(enqueue([], result('i1', 'skipped')), result('i1', 'done'));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ status: 'done' });
  });

  it('classifies network failures and server refusals', () => {
    expect(classifyError({ message: 'TypeError: Network request failed' })).toBe('network');
    expect(classifyError({ message: 'Failed to fetch' })).toBe('network');
    expect(classifyError({ message: 'day_closed', code: '22023' })).toBe('refused');
    expect(
      classifyError({ message: 'new row violates row-level security policy', code: '42501' }),
    ).toBe('refused');
  });

  it('replays in order, drops refusals and stops at the first network failure', async () => {
    const q = [
      habit('h1', 'check'),
      result('i1', 'done'),
      habit('h2', 'check'),
      habit('h3', 'check'),
    ];
    const seen: string[] = [];
    const out = await replay(q, async (op) => {
      seen.push(op.id);
      if (op.kind === 'result') return { message: 'day_closed', code: '22023' };
      if (op.kind === 'habit' && op.habitId === 'h2') return { message: 'Network request failed' };
      return null;
    });
    expect(seen).toHaveLength(3);
    expect(out.applied).toBe(1);
    expect(out.refused.map((r) => r.reason)).toEqual(['day_closed']);
    expect(out.remaining.map((o) => (o.kind === 'habit' ? o.habitId : o.itemId))).toEqual([
      'h2',
      'h3',
    ]);
  });

  it('a thrown error is a network failure when it says so', async () => {
    const out = await replay([habit('h1', 'check')], async () => {
      throw new Error('Network request failed');
    });
    expect(out.remaining).toHaveLength(1);
  });
});
