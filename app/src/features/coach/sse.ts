// Server-Sent Events parser (pure): complete events out of a text buffer, rest kept for later.
export type SseEvent = { event: string; data: unknown };

export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (data.length === 0) continue;
    try {
      events.push({ event, data: JSON.parse(data.join('\n')) });
    } catch {
      events.push({ event, data: data.join('\n') });
    }
  }
  return { events, rest };
}
