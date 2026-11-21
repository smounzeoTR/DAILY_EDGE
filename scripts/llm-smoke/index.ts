// npm run llm:smoke — OPTIONAL manual check of a real provider (never part of npm test).
// Reads supabase/functions/.env (LLM_PROVIDER, LLM_MODEL, key, prices) and sends one fictitious
// daily-plan request. Stops without calling anything when no key is configured.
import { llmConfigFromEnv } from '../../supabase/functions/_shared/llm/config.ts';
import {
  buildPlanPayload,
  buildPlanRequest,
  checkPlanOutput,
  PLAN_PROMPT_VERSION,
  PlanOutputSchema,
} from '../../supabase/functions/_shared/llm/planTask.ts';
import { runTask, type LlmCallRecord } from '../../supabase/functions/_shared/llm/runTask.ts';

const config = llmConfigFromEnv((name) => process.env[name]);
if (!config.enabled || config.provider.name === 'mock') {
  console.log(
    `No real provider configured (${config.enabled ? 'mock' : config.reason}): nothing sent. ` +
      'Fill in supabase/functions/.env (see .env.example) to try one.',
  );
  process.exit(0);
}

const exercise = (id: string, title: string, instructions: string, duration: number) => ({
  id,
  title_fr: title,
  title_en: title,
  instructions_fr: instructions,
  instructions_en: instructions,
  duration_min: duration,
  energy: 'medium',
  difficulty: 2,
  domain: 'clarity_goals',
});

// Fictitious user: no real data is ever sent by this script
const payload = buildPlanPayload({
  language: 'fr',
  mode: 'catalog',
  planMode: 'normal',
  programDay: null,
  budgetMinutes: 30,
  rulesWhy: 'Ton domaine prioritaire : clarté et objectifs.',
  profile: {
    situation: 'entrepreneur',
    level: 'beginner',
    persona: 'entrepreneur',
    daily_minutes: 30,
    priority_domains: ['clarity_goals'],
    blockers: ['procrastination'],
  },
  goal: {
    title: 'Signer 5 clients',
    why: 'Vivre de mon activité',
    target_value: 5,
    unit: 'clients',
    deadline: '2027-03-31',
  },
  checkins: [{ date: '2026-11-20', energy: 3, mood: 4, minutes_tomorrow: 30 }],
  candidates: [
    exercise(
      'E001',
      'Écrire son objectif',
      'Écris ton objectif principal en une phrase précise et datée.',
      10,
    ),
    exercise(
      'E002',
      'Trois priorités',
      'Note les trois actions qui feront avancer ton objectif cette semaine.',
      10,
    ),
    exercise('E003', 'WOOP', 'Souhait, résultat, obstacle, plan : rédige un plan si-alors.', 15),
  ],
  lockedIds: [],
});

const records: LlmCallRecord[] = [];
const result = await runTask({
  provider: config.provider,
  pricing: config.pricing,
  store: {
    countCalls: async () => 0,
    findCachedOutput: async () => null,
    logCall: async (record) => {
      records.push(record);
    },
  },
  userId: 'smoke-test',
  feature: 'plan',
  localDate: new Date().toISOString().slice(0, 10),
  promptVersion: PLAN_PROMPT_VERSION,
  request: buildPlanRequest(payload),
  schema: PlanOutputSchema,
  check: (output) => checkPlanOutput(output, payload),
  apply: async () => null,
  onFallback: async () => undefined,
});
const record = records[0];
console.log(`Provider ${config.provider.name}, model ${config.provider.model}: ${result.outcome}`);
if (result.fallbackReason) console.log(`Fallback reason: ${result.fallbackReason}`);
if (record) {
  console.log(
    `Tokens ${record.inputTokens} in / ${record.outputTokens} out, ~${record.costEur} EUR, ` +
      `${record.latencyMs} ms, ${record.attempts} attempt(s)`,
  );
}
console.log(JSON.stringify(result.output, null, 2));
