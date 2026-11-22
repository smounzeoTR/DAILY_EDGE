// Coach Edge conversation turn (shared by the assistant-chat Edge Function and the eval script):
// quota, distress safety net, history (summarized beyond ~20 messages), context, then the
// model <-> tools loop (at most 4 tool calls), streamed to the caller through `emit`.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types.ts';
import { estimateCost, type LlmStore } from '../llm/runTask.ts';
import {
  LlmError,
  type LlmContentBlock,
  type LlmMessage,
  type LlmPricing,
  type LlmProvider,
  type LlmResponse,
  type LlmToolResultBlock,
} from '../llm/types.ts';
import { loadAssistantContext } from './context.ts';
import { detectDistress } from './distress.ts';
import { claimsCard } from './claims.ts';
import {
  ASSISTANT_PROMPT_VERSION,
  ASSISTANT_RULES,
  buildDynamicSystem,
  SUMMARY_SYSTEM,
} from './prompt.ts';
import { createIdentifierFilter } from './sanitize.ts';
import { MAX_TOOL_CALLS, runTool, TOOL_DEFINITIONS } from './tools.ts';

type Client = SupabaseClient<Database>;
type Profile = Database['public']['Tables']['profiles']['Row'];
type ActionRow = Database['public']['Tables']['assistant_actions']['Row'];

export const MAX_MESSAGE_CHARS = 4000;
export const SUMMARY_THRESHOLD = 20;
export const KEEP_RECENT = 10;
export const TURN_TIMEOUT_MS = 25_000;
export const MAX_ANSWER_TOKENS = 1500;

export type ChatEvent =
  | { event: 'thread'; data: { id: string } }
  | { event: 'safety'; data: { line: '3114' } }
  | { event: 'text'; data: { text: string } }
  | { event: 'action'; data: ActionRow }
  | { event: 'done'; data: { message_id: string; remaining: number } }
  | { event: 'error'; data: { code: string } }
  // Local mock provider only: the request sent (data minimization tests)
  | { event: 'debug'; data: { system: string; messages: unknown } };

export type ChatArgs = {
  db: Client;
  ai: { provider: LlmProvider; pricing: LlmPricing; store: LlmStore };
  profile: Profile;
  threadId: string | null;
  message: string;
  now: Date;
  emit: (event: ChatEvent) => void;
};

// Local date and the UTC bounds of the user's local day
export function localDayBounds(timeZone: string, now: Date) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  const offsetAt = (utcMs: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    return asUtc - utcMs;
  };
  const midnight = (isoDate: string) => {
    const guess = Date.parse(`${isoDate}T00:00:00Z`);
    const first = guess - offsetAt(guess);
    return first - (offsetAt(first) - offsetAt(guess));
  };
  const next = new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return {
    date,
    start: new Date(midnight(date)).toISOString(),
    end: new Date(midnight(next)).toISOString(),
  };
}

export async function assistantQuota(db: Client, profile: Profile, now: Date) {
  const { start } = localDayBounds(profile.timezone, now);
  const [count, limit] = await Promise.all([
    db
      .from('assistant_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.user_id)
      .eq('role', 'user')
      .gte('created_at', start),
    db.rpc('assistant_daily_limit'),
  ]);
  if (count.error) throw count.error;
  if (limit.error) throw limit.error;
  const max = Number(limit.data ?? 30);
  return { used: count.count ?? 0, limit: max, remaining: Math.max(0, max - (count.count ?? 0)) };
}

async function ensureThread(
  db: Client,
  profile: Profile,
  threadId: string | null,
  message: string,
) {
  if (threadId) {
    const { data, error } = await db
      .from('assistant_threads')
      .select('id, summary, summarized_until')
      .eq('id', threadId)
      .eq('user_id', profile.user_id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db
    .from('assistant_threads')
    .insert({ user_id: profile.user_id, title: message.slice(0, 60) })
    .select('id, summary, summarized_until')
    .single();
  if (error) throw error;
  return data;
}

// Older messages summarized once the thread is long; the summary is kept on the thread
async function history(
  args: ChatArgs,
  thread: { id: string; summary: string | null; summarized_until: string | null },
) {
  const { db, ai, profile } = args;
  let query = db
    .from('assistant_messages')
    .select('role, content, created_at')
    .eq('thread_id', thread.id)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true });
  if (thread.summarized_until) query = query.gt('created_at', thread.summarized_until);
  const { data, error } = await query;
  if (error) throw error;
  let rows = (data ?? []).filter((r) => r.content.trim() !== '');
  let summary = thread.summary;
  if (rows.length > SUMMARY_THRESHOLD) {
    const older = rows.slice(0, rows.length - KEEP_RECENT);
    const started = Date.now();
    const transcript = older.map((r) => `${r.role}: ${r.content}`).join('\n');
    const response = await ai.provider.complete({
      system: SUMMARY_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${summary ? `Previous summary:\n${summary}\n\n` : ''}Conversation:\n${transcript}`,
        },
      ],
      maxTokens: 600,
      signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
    });
    summary = response.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim();
    const until = older[older.length - 1]?.created_at ?? null;
    const { error: e } = await db
      .from('assistant_threads')
      .update({ summary, summarized_until: until })
      .eq('id', thread.id);
    if (e) throw e;
    await ai.store.logCall({
      userId: profile.user_id,
      feature: 'assistant',
      localDate: localDayBounds(profile.timezone, args.now).date,
      provider: ai.provider.name,
      model: ai.provider.model,
      outcome: 'success',
      fallbackReason: 'history_summary',
      attempts: 1,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costEur: estimateCost(ai.pricing, response.usage.inputTokens, response.usage.outputTokens),
      latencyMs: Date.now() - started,
      inputHash: '',
      output: null,
    });
    rows = rows.slice(rows.length - KEEP_RECENT);
  }
  const messages: LlmMessage[] = rows.map((r) => ({
    role: r.role === 'assistant' ? 'assistant' : 'user',
    content: r.content,
  }));
  return { messages, summary };
}

export async function runChat(args: ChatArgs): Promise<void> {
  const { db, ai, profile, emit } = args;
  const text = args.message.trim();
  if (text.length === 0 || text.length > MAX_MESSAGE_CHARS) {
    emit({ event: 'error', data: { code: 'invalid_message' } });
    return;
  }
  const day = localDayBounds(profile.timezone, args.now);
  const language = profile.locale === 'en' ? 'en' : 'fr';

  const thread = await ensureThread(db, profile, args.threadId, text);
  if (!thread) {
    emit({ event: 'error', data: { code: 'thread_not_found' } });
    return;
  }
  emit({ event: 'thread', data: { id: thread.id } });

  // History first (the new message is appended after)
  const past = await history(args, thread);

  // Safety net, independent of the model: the help card is shown whatever the model answers
  const distress = detectDistress(text);
  const { error: userError } = await db.from('assistant_messages').insert({
    thread_id: thread.id,
    user_id: profile.user_id,
    role: 'user',
    content: text,
    distress,
  });
  if (userError) throw userError;
  if (distress) emit({ event: 'safety', data: { line: '3114' } });

  const context = await loadAssistantContext(db, profile, day.date);
  // Fixed rules cached (with the tools); the user's data after the cache breakpoint
  const system = buildDynamicSystem(language, context, past.summary);
  const messages: LlmMessage[] = [...past.messages, { role: 'user', content: text }];

  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let turns = 0;
  let toolCalls = 0;
  let answer = '';
  const calls: { name: string; input: unknown; action_id?: string; error?: boolean }[] = [];
  let firstAction: string | null = null;
  let failure: string | null = null;

  try {
    for (;;) {
      turns += 1;
      // Text of a new turn (after a tool) starts a new paragraph
      let needBreak = answer.trim() !== '';
      const filter = createIdentifierFilter();
      const request = {
        cachedSystem: ASSISTANT_RULES,
        system,
        messages,
        tools: TOOL_DEFINITIONS,
        // The tool budget is spent: a text answer only
        toolChoice: toolCalls >= MAX_TOOL_CALLS ? ('none' as const) : ('auto' as const),
        maxTokens: MAX_ANSWER_TOKENS,
        signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
      };
      if (ai.provider.name === 'mock') {
        emit({ event: 'debug', data: { system: `${ASSISTANT_RULES}\n\n${system}`, messages } });
      }
      let response: LlmResponse | null = null;
      const stream = ai.provider.stream
        ? ai.provider.stream(request)
        : (async function* () {
            const r = await ai.provider.complete(request);
            for (const b of r.content)
              if (b.type === 'text') yield { type: 'text_delta' as const, text: b.text };
            yield { type: 'done' as const, response: r };
          })();
      for await (const ev of stream) {
        if (ev.type === 'text_delta') {
          let chunk = filter.push(ev.text);
          if (chunk === '') continue;
          if (needBreak && chunk.trim() !== '') {
            chunk = `\n\n${chunk.trimStart()}`;
            answer = answer.trimEnd();
            needBreak = false;
          }
          answer += chunk;
          emit({ event: 'text', data: { text: chunk } });
        } else if (ev.type === 'done') {
          response = ev.response;
        }
      }
      const tail = filter.flush();
      if (tail) {
        answer += tail;
        emit({ event: 'text', data: { text: tail } });
      }
      if (!response) throw new LlmError('provider_error', 'no response');
      inputTokens += response.usage.inputTokens;
      outputTokens += response.usage.outputTokens;
      cacheReadTokens += response.usage.cacheReadTokens ?? 0;
      cacheWriteTokens += response.usage.cacheWriteTokens ?? 0;
      const uses = response.content.filter(
        (b): b is Extract<LlmContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
      );
      if (uses.length === 0 || request.toolChoice === 'none') break;

      const results: LlmToolResultBlock[] = [];
      for (const use of uses) {
        if (toolCalls >= MAX_TOOL_CALLS) {
          results.push({
            type: 'tool_result',
            toolUseId: use.id,
            content: JSON.stringify({ error: 'tool_limit_reached' }),
            isError: true,
          });
          continue;
        }
        toolCalls += 1;
        const outcome = await runTool(
          {
            db,
            userId: profile.user_id,
            threadId: thread.id,
            today: day.date,
            endOfDay: day.end,
            language,
          },
          use.name,
          use.input,
        );
        if (outcome.action) {
          firstAction ??= outcome.action.id;
          emit({ event: 'action', data: outcome.action });
        }
        calls.push({
          name: use.name,
          input: use.input,
          ...(outcome.action ? { action_id: outcome.action.id } : {}),
          ...(outcome.isError ? { error: true } : {}),
        });
        results.push({
          type: 'tool_result',
          toolUseId: use.id,
          content: outcome.content,
          ...(outcome.isError ? { isError: true } : {}),
        });
      }
      messages.push({ role: 'assistant', content: response.content, raw: response.raw });
      messages.push({ role: 'user', content: results });
    }
  } catch (error) {
    failure = error instanceof LlmError ? error.reason : 'provider_error';
    console.error('assistant turn failed', error);
  }

  const { data: saved, error: saveError } = await db
    .from('assistant_messages')
    .insert({
      thread_id: thread.id,
      user_id: profile.user_id,
      role: 'assistant',
      content: answer.trim(),
      tool_calls: calls.length ? (calls as never) : null,
      action_id: firstAction,
    })
    .select('id')
    .single();
  if (saveError) throw saveError;
  await db
    .from('assistant_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', thread.id);
  await ai.store
    .logCall({
      userId: profile.user_id,
      feature: 'assistant',
      localDate: day.date,
      provider: ai.provider.name,
      model: ai.provider.model,
      outcome: failure ? 'fallback' : 'success',
      fallbackReason: failure,
      // A card announced while no action was created in this turn
      detail: !failure && !firstAction && claimsCard(answer) ? 'card_claimed_without_action' : null,
      cacheReadTokens,
      cacheWriteTokens,
      attempts: Math.min(turns, 5),
      inputTokens,
      outputTokens,
      costEur: estimateCost(
        ai.pricing,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
      ),
      latencyMs: Date.now() - started,
      inputHash: ASSISTANT_PROMPT_VERSION,
      output: null,
    })
    .catch((e: unknown) => console.error('llm_calls insert failed', e));

  if (failure) emit({ event: 'error', data: { code: 'assistant_unavailable' } });
  const quota = await assistantQuota(db, profile, args.now);
  emit({ event: 'done', data: { message_id: saved.id, remaining: quota.remaining } });
}
