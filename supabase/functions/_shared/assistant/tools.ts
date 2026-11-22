// Assistant tools. Read tools return data (never reflections, notes or proofs). Write tools never
// write: they validate their parameters (zod, then the database) and create a pending action in
// assistant_actions, shown to the user as an "Appliquer / Annuler" card; confirm_assistant_action
// executes it later with the same rules as the app.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../database.types.ts';
import type { LlmTool } from '../llm/types.ts';
import { loadToday } from './context.ts';

type Client = SupabaseClient<Database>;
type ActionRow = Database['public']['Tables']['assistant_actions']['Row'];

export const MAX_TOOL_CALLS = 4;

export type ToolEnv = {
  db: Client;
  userId: string;
  threadId: string;
  // User's local date and end of the local day (expiry of the actions)
  today: string;
  endOfDay: string;
  language: 'fr' | 'en';
};

export type ToolOutcome = {
  // Sent back to the model as data
  content: string;
  isError?: boolean;
  // Pending action created (write tools)
  action?: ActionRow;
};

const STATUSES = ['done', 'skipped', 'too_hard'] as const;

export const TOOL_SCHEMAS = {
  get_today: z.object({}).strict(),
  search_catalog: z
    .object({
      query: z.string().max(80).optional(),
      kind: z.enum(['exercise', 'habit', 'all']).optional(),
      domain: z.string().max(40).optional(),
      max_minutes: z.number().int().min(1).max(240).optional(),
      swap_valid: z.boolean().optional(),
      limit: z.number().int().min(1).max(10).optional(),
    })
    .strict(),
  get_week_summary: z.object({}).strict(),
  adapt_today: z.object({ minutes: z.number().int().min(1).max(240).optional() }).strict(),
  swap_exercise: z.object({ exercise_id: z.string().min(1).max(10) }).strict(),
  save_exercise_result: z
    .object({
      exercise_id: z.string().min(1).max(10),
      status: z.enum(STATUSES),
      proof: z.string().max(1000).optional(),
      rating: z.number().int().min(1).max(5).optional(),
    })
    .strict(),
  add_habit: z
    .object({ template_id: z.string().min(1).max(10), cue: z.string().max(120).optional() })
    .strict(),
  update_goal_progress: z.object({ value: z.number().min(0).max(1e9) }).strict(),
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
export const WRITE_TOOLS: ToolName[] = [
  'adapt_today',
  'swap_exercise',
  'save_exercise_result',
  'add_habit',
  'update_goal_progress',
];

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export const TOOL_DEFINITIONS: LlmTool[] = [
  {
    name: 'get_today',
    description:
      "Today's plan of the user: mode, program day, principle, exercises (id, title, duration, status), habits done or not, check-in done, minutes available.",
    inputSchema: obj({}),
  },
  {
    name: 'search_catalog',
    description:
      'Search the catalogue: published exercises and habit templates (kind: exercise, habit or all; all by default). Results are ranked by the words of the query found in titles and descriptions. Use swap_valid=true to get only the exercises that can replace the exercise of the day (same principle in program mode, fits the time available, not already in the plan). For an unrealistic or missing request, propose the closest result.',
    inputSchema: obj({
      query: { type: 'string', description: 'Words to look for (e.g. "méditer silence")' },
      kind: { type: 'string', enum: ['exercise', 'habit', 'all'] },
      domain: { type: 'string', description: 'Domain code, e.g. clarity_goals' },
      max_minutes: { type: 'integer' },
      swap_valid: { type: 'boolean' },
      limit: { type: 'integer', description: '1 to 10' },
    }),
  },
  {
    name: 'get_week_summary',
    description:
      'Current weekly review: exercises done, habit rates, energy average (if consented), best day and the proposals with their answers. Read only.',
    inputSchema: obj({}),
  },
  {
    name: 'adapt_today',
    description:
      "PROPOSES a shorter version of today's plan fitting the minutes given (program: the step's minimal exercise). Nothing changes until the user taps Apply.",
    inputSchema: obj({ minutes: { type: 'integer', description: 'Minutes available today' } }),
  },
  {
    name: 'swap_exercise',
    description:
      'PROPOSES to replace the exercise of the day by another one returned by search_catalog with swap_valid=true. Nothing changes until the user taps Apply.',
    inputSchema: obj({ exercise_id: { type: 'string' } }, ['exercise_id']),
  },
  {
    name: 'save_exercise_result',
    description:
      "PROPOSES to record the result of an exercise of today (done, skipped or too_hard), with the user's proof (what they did) and an optional rating 1-5. Nothing is saved until the user taps Apply.",
    inputSchema: obj(
      {
        exercise_id: { type: 'string' },
        status: { type: 'string', enum: [...STATUSES] },
        proof: { type: 'string' },
        rating: { type: 'integer' },
      },
      ['exercise_id', 'status'],
    ),
  },
  {
    name: 'add_habit',
    description:
      'PROPOSES to add a habit from the habit templates (6 active habits at most), with an optional cue. Nothing is added until the user taps Apply.',
    inputSchema: obj({ template_id: { type: 'string' }, cue: { type: 'string' } }, ['template_id']),
  },
  {
    name: 'update_goal_progress',
    description:
      "PROPOSES to set the current value of the user's active goal. Nothing changes until the user taps Apply.",
    inputSchema: obj({ value: { type: 'number' } }, ['value']),
  },
];

const fail = (reason: string): ToolOutcome => ({
  content: JSON.stringify({ error: reason }),
  isError: true,
});

// A few close words (stems of 5 letters), so that a request absent from the catalogue still finds
// the closest entries (e.g. "méditer" -> a few minutes of silence, breathing)
const SYNONYMS: Record<string, string[]> = {
  medit: ['silen', 'respi', 'calme'],
  pleine: ['silen', 'respi'],
  relax: ['respi', 'calme', 'silen'],
  stres: ['respi', 'calme', 'pause'],
  sport: ['march', 'bouge', 'activ'],
  courir: ['march', 'bouge'],
  runni: ['walk', 'move'],
  livre: ['lectu', 'lire', 'pages'],
  dormi: ['somme', 'couch', 'ecran'],
  sleep: ['bedti', 'scree'],
};

// Not a mistake of the model: the action needs information only the user can give
const proofRequired = (proofType: string, next: string): ToolOutcome => ({
  content: JSON.stringify({ status: 'proof_required', proof_type: proofType, next_step: next }),
  isError: true,
});

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

async function swapCandidates(env: ToolEnv): Promise<Set<string>> {
  const { data, error } = await env.db.rpc('swap_candidates', {
    p_user_id: env.userId,
    p_date: env.today,
  });
  if (error) throw error;
  return new Set((data ?? []).map((r: { exercise_id: string }) => r.exercise_id));
}

async function planUntouched(env: ToolEnv): Promise<string | null> {
  const { data, error } = await env.db
    .from('daily_plans')
    .select('id, generated_at, plan_items(origin, status)')
    .eq('user_id', env.userId)
    .eq('date', env.today)
    .maybeSingle();
  if (error) throw error;
  if (!data?.generated_at) return 'plan_not_found';
  return data.plan_items.some((i) => i.origin === 'engine' && i.status !== 'todo')
    ? 'plan_touched'
    : null;
}

// Pending action: nothing is written in the user's data
async function propose(
  env: ToolEnv,
  type: ToolName,
  params: Record<string, unknown>,
): Promise<ToolOutcome> {
  const { data, error } = await env.db
    .from('assistant_actions')
    .insert({
      user_id: env.userId,
      thread_id: env.threadId,
      type,
      params: params as Database['public']['Tables']['assistant_actions']['Insert']['params'],
      expires_at: env.endOfDay,
    })
    .select('*')
    .single();
  if (error) throw error;
  return {
    content: JSON.stringify({
      status: 'pending_confirmation',
      action_id: data.id,
      note: 'Shown to the user as a card with Apply / Cancel. Nothing has changed yet.',
    }),
    action: data,
  };
}

export async function runTool(env: ToolEnv, name: string, rawInput: unknown): Promise<ToolOutcome> {
  if (!(name in TOOL_SCHEMAS)) return fail('unknown_tool');
  const parsed = TOOL_SCHEMAS[name as ToolName].safeParse(rawInput ?? {});
  if (!parsed.success) return fail('invalid_parameters');
  const input = parsed.data as Record<string, unknown>;
  const lang = env.language;
  const title = (row: { title_fr: string; title_en: string }) =>
    lang === 'en' ? row.title_en : row.title_fr;

  switch (name as ToolName) {
    case 'get_today': {
      const today = await loadToday(env.db, env.userId, env.today, lang);
      return { content: JSON.stringify(today ?? { error: 'no_plan_today' }) };
    }
    case 'search_catalog': {
      const kind = String(input.kind ?? (input.swap_valid ? 'exercise' : 'all'));
      const limit = Number(input.limit ?? 8);
      // Ranked by the number of query words (4 letters or more, stem of 5) found in the texts
      const stems = normalize(String(input.query ?? ''))
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4)
        .map((w) => w.slice(0, 5));
      const words = [...new Set(stems.flatMap((w) => [w, ...(SYNONYMS[w] ?? [])]))];
      const score = (text: string) => {
        const t = normalize(text);
        return words.filter((w) => t.includes(w)).length;
      };
      const ranked = <R extends { text: string }>(rows: R[]) =>
        words.length === 0
          ? rows
          : rows
              .map((r) => ({ r, s: score(r.text) }))
              .filter((x) => x.s > 0)
              .sort((a, b) => b.s - a.s)
              .map((x) => x.r);
      const result: Record<string, unknown> = {};
      if (kind !== 'habit') {
        const { data, error } = await env.db
          .from('exercises')
          .select('id, title_fr, title_en, instructions_fr, instructions_en, duration_min, domain')
          .eq('status', 'published')
          .order('id');
        if (error) throw error;
        const valid = input.swap_valid ? await swapCandidates(env) : null;
        result.exercises = ranked(
          (data ?? [])
            .filter((e) => !valid || valid.has(e.id))
            .filter((e) => !input.domain || e.domain === input.domain)
            .filter((e) => !input.max_minutes || e.duration_min <= Number(input.max_minutes))
            .map((e) => ({
              e,
              text: `${title(e)} ${lang === 'en' ? e.instructions_en : e.instructions_fr}`,
            })),
        )
          .slice(0, limit)
          .map(({ e }) => ({
            id: e.id,
            title: title(e),
            duration_min: e.duration_min,
            domain: e.domain,
          }));
      }
      if (kind !== 'exercise') {
        const { data, error } = await env.db
          .from('habit_templates')
          .select(
            'id, title_fr, title_en, description_fr, description_en, minimal_version_fr, minimal_version_en, frequency, domain',
          )
          .order('id');
        if (error) throw error;
        const pick = (h: Record<string, unknown>, field: string) =>
          String(h[`${field}_${lang}`] ?? '');
        result.habits = ranked(
          (data ?? [])
            .filter((h) => !input.domain || h.domain === input.domain)
            .map((h) => ({
              h,
              text: `${pick(h, 'title')} ${pick(h, 'description')} ${pick(h, 'minimal_version')}`,
            })),
        )
          .slice(0, limit)
          .map(({ h }) => ({
            template_id: h.id,
            title: pick(h, 'title'),
            minimal_version: pick(h, 'minimal_version'),
            frequency: h.frequency,
            domain: h.domain,
          }));
      }
      return { content: JSON.stringify(result) };
    }
    case 'get_week_summary': {
      const { data, error } = await env.db
        .from('weekly_reviews')
        .select('week_start, stats, proposals, accepted, summary')
        .eq('user_id', env.userId)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return { content: JSON.stringify(data ?? { error: 'no_review_yet' }) };
    }
    case 'adapt_today': {
      const problem = await planUntouched(env);
      return problem ? fail(problem) : propose(env, 'adapt_today', input);
    }
    case 'swap_exercise': {
      const problem = await planUntouched(env);
      if (problem) return fail(problem);
      if (!(await swapCandidates(env)).has(String(input.exercise_id))) return fail('invalid_swap');
      return propose(env, 'swap_exercise', input);
    }
    case 'save_exercise_result': {
      const { data, error } = await env.db
        .from('plan_items')
        .select('id, daily_plans!inner(date), exercise:exercises(proof_type)')
        .eq('user_id', env.userId)
        .eq('exercise_id', String(input.exercise_id))
        .eq('daily_plans.date', env.today)
        .maybeSingle();
      if (error) throw error;
      if (!data) return fail('exercise_not_in_today_plan');
      // Same proof rules as set_plan_item_result: ask the user before proposing the action
      if (input.status === 'done') {
        const proofType = data.exercise?.proof_type ?? 'checkbox';
        const proof = String(input.proof ?? '').trim();
        if (proofType === 'free_text' && !proof) {
          return proofRequired(
            'free_text',
            'Ask the user what they did (a few words), then call again with proof.',
          );
        }
        if (proofType === 'numeric' && !/^-?[0-9]+([.,][0-9]+)?$/.test(proof)) {
          return proofRequired(
            'numeric',
            'Ask the user for the number (e.g. how many), then call again with proof.',
          );
        }
      }
      return propose(env, 'save_exercise_result', input);
    }
    case 'add_habit': {
      const [template, active] = await Promise.all([
        env.db
          .from('habit_templates')
          .select('id')
          .eq('id', String(input.template_id))
          .maybeSingle(),
        env.db
          .from('user_habits')
          .select('template_id')
          .eq('user_id', env.userId)
          .eq('active', true),
      ]);
      if (template.error) throw template.error;
      if (active.error) throw active.error;
      if (!template.data) return fail('unknown_habit_template');
      if ((active.data ?? []).some((h) => h.template_id === input.template_id)) {
        return fail('habit_already_active');
      }
      if ((active.data ?? []).length >= 6) return fail('too_many_habits');
      return propose(env, 'add_habit', input);
    }
    case 'update_goal_progress': {
      const { data, error } = await env.db
        .from('goals')
        .select('id')
        .eq('user_id', env.userId)
        .eq('status', 'active')
        .limit(1);
      if (error) throw error;
      return data?.length ? propose(env, 'update_goal_progress', input) : fail('no_active_goal');
    }
  }
}
