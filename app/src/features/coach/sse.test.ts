import { describe, expect, it } from 'vitest';

import { parseSse } from './sse';

describe('SSE parser', () => {
  it('returns complete events and keeps the rest', () => {
    const { events, rest } = parseSse(
      'event: thread\ndata: {"id":"t1"}\n\nevent: text\ndata: {"text":"Bon"}\n\nevent: te',
    );
    expect(events).toEqual([
      { event: 'thread', data: { id: 't1' } },
      { event: 'text', data: { text: 'Bon' } },
    ]);
    expect(rest).toBe('event: te');
  });
  it('joins chunks split anywhere', () => {
    const first = parseSse('event: text\ndata: {"te');
    expect(first.events).toEqual([]);
    const second = parseSse(`${first.rest}xt":"jour"}\n\n`);
    expect(second.events).toEqual([{ event: 'text', data: { text: 'jour' } }]);
  });
});
