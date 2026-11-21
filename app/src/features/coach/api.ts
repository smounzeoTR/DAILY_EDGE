// Coach Edge: streamed turn (assistant-chat, SSE read with expo/fetch) and stored conversations.
import { useQuery } from '@tanstack/react-query';
import { fetch } from 'expo/fetch';

import type { Database } from '@/lib/database.types';
import { supabase, supabaseKey, supabaseUrl } from '@/lib/supabase';

import { parseSse } from './sse';

export type CoachAction = Database['public']['Tables']['assistant_actions']['Row'];

export type CoachStreamEvent =
  | { event: 'thread'; data: { id: string } }
  | { event: 'safety'; data: { line: string } }
  | { event: 'text'; data: { text: string } }
  | { event: 'action'; data: CoachAction }
  | { event: 'done'; data: { message_id: string; remaining: number } }
  | { event: 'error'; data: { code: string } };

// Sends a message; calls onEvent for every event received. Returns an error code, or null.
export async function sendCoachMessage(
  threadId: string | null,
  message: string,
  onEvent: (event: CoachStreamEvent) => void,
): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 'unauthorized';
  const res = await fetch(`${supabaseUrl}/functions/v1/assistant-chat`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(threadId ? { thread_id: threadId, message } : { message }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `http_${res.status}`;
  }
  const reader = res.body?.getReader();
  if (!reader) return 'no_stream';
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    for (const e of parsed.events) onEvent(e as CoachStreamEvent);
  }
  return null;
}

export const coachKeys = {
  threads: (userId: string) => ['coachThreads', userId] as const,
  thread: (threadId: string) => ['coachThread', threadId] as const,
  quota: (userId: string) => ['coachQuota', userId] as const,
};

export function useCoachThreads(userId: string) {
  return useQuery({
    queryKey: coachKeys.threads(userId),
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assistant_threads')
        .select('id, title, last_message_at')
        .order('last_message_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCoachThread(threadId: string | null) {
  return useQuery({
    queryKey: coachKeys.thread(threadId ?? 'new'),
    enabled: Boolean(threadId),
    staleTime: 0,
    queryFn: async () => {
      const [messages, actions] = await Promise.all([
        supabase
          .from('assistant_messages')
          .select('id, role, content, tool_calls, action_id, distress, created_at')
          .eq('thread_id', threadId ?? '')
          .in('role', ['user', 'assistant'])
          .order('created_at'),
        supabase
          .from('assistant_actions')
          .select('*')
          .eq('thread_id', threadId ?? '')
          .order('created_at'),
      ]);
      if (messages.error) throw messages.error;
      if (actions.error) throw actions.error;
      return { messages: messages.data ?? [], actions: actions.data ?? [] };
    },
  });
}

export function useCoachQuota(userId: string) {
  return useQuery({
    queryKey: coachKeys.quota(userId),
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('assistant_quota');
      if (error) throw error;
      return data as { used: number; limit: number };
    },
  });
}
