// assistant-chat: one Coach Edge turn, streamed as Server-Sent Events.
// The user comes from the JWT only. Body: { "thread_id"?: uuid, "message": string }.
// Premium (is_premium) + AI consent + account not pending deletion; daily message quota.
// Events: thread, safety (help card), text (chunk), action (Apply / Cancel card), done, error.
import { isAiEligible, supabaseLlmStore } from '../_shared/ai/store.ts';
import {
  assistantQuota,
  localDayBounds,
  runChat,
  type ChatEvent,
} from '../_shared/assistant/chat.ts';
import { llmConfigFromEnv } from '../_shared/llm/config.ts';
import { env, json, loadProfile, serviceClient } from '../_shared/plans/generatePlan.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function parseBody(
  req: Request,
): Promise<{ threadId: string | null; message: string } | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { thread_id: threadId, message, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return null;
  if (typeof message !== 'string') return null;
  if (
    threadId !== undefined &&
    threadId !== null &&
    (typeof threadId !== 'string' || !UUID.test(threadId))
  ) {
    return null;
  }
  return { threadId: (threadId as string | undefined) ?? null, message };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized' });

  const db = serviceClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return json(401, { error: 'unauthorized' });

  const body = await parseBody(req);
  if (!body) return json(400, { error: 'invalid_request' });

  try {
    const profile = await loadProfile(db, auth.user.id);
    if (!profile?.onboarded_at) return json(409, { error: 'not_onboarded' });
    if (!(await isAiEligible(db, profile))) return json(403, { error: 'not_eligible' });

    const config = llmConfigFromEnv((name) => Deno.env.get(name), 'assistant');
    if (!config.enabled) return json(503, { error: 'assistant_unavailable' });
    const store = supabaseLlmStore(db);
    const now = new Date();

    const quota = await assistantQuota(db, profile, now);
    if (quota.remaining <= 0) {
      await store
        .logCall({
          userId: profile.user_id,
          feature: 'assistant',
          localDate: localDayBounds(profile.timezone, now).date,
          provider: config.provider.name,
          model: config.provider.model,
          outcome: 'quota_exceeded',
          fallbackReason: 'quota',
          attempts: 0,
          inputTokens: 0,
          outputTokens: 0,
          costEur: 0,
          latencyMs: null,
          inputHash: '',
          output: null,
        })
        .catch(() => undefined);
      return json(429, { error: 'quota_exceeded', limit: quota.limit });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (e: ChatEvent) =>
          controller.enqueue(
            encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`),
          );
        try {
          await runChat({
            db,
            ai: { provider: config.provider, pricing: config.pricing, store },
            profile,
            threadId: body.threadId,
            message: body.message,
            now,
            emit,
          });
        } catch (error) {
          console.error('assistant-chat failed', error);
          emit({ event: 'error', data: { code: 'internal_error' } });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('assistant-chat failed', error);
    return json(500, { error: 'internal_error' });
  }
});
