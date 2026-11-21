// npm run seed:demo — LOCAL ONLY. Creates the demo user of the spec (§ 8): Entrepreneur, PR1,
// day 10 today, 11 days of realistic history (2 skips, one low-energy day followed by a short
// version), habits, check-ins, a goal and last week's review. Re-runnable (recreates the user).
// Sign in with demo@daily-edge.local: the 6-digit code is in Mailpit (http://127.0.0.1:54324).
import { execSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../supabase/functions/_shared/database.types.ts';
import { addDays } from '../../supabase/functions/_shared/habits/schedule.ts';
import { mondayOf } from '../../supabase/functions/_shared/review/buildWeeklyReview.ts';
import {
  generateReviewForUser,
  localClock,
} from '../../supabase/functions/_shared/review/generateReview.ts';
import { assertLocal } from './guard.ts';

export const DEMO_EMAIL = 'demo@daily-edge.local';
// Local admin (role admin; the TOTP factor is enrolled in the app, then required)
export const ADMIN_EMAIL = 'admin@daily-edge.local';
const TIMEZONE = 'Europe/Paris';

type Status = { API_URL: string; SERVICE_ROLE_KEY: string };
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Status;
assertLocal(status.API_URL);
const db = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function must<T>(result: { data: T; error: unknown }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  }
  return result.data as NonNullable<T>;
}

// Instant of a local Paris date at a given hour (good enough for demo timestamps)
const at = (date: string, hour: number) =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+01:00`).toISOString();

// 11 days of history: program day, mode, result (2 skips, low energy on J-7 -> short version J-6)
const HISTORY: {
  offset: number;
  day: number;
  mode: 'normal' | 'minimal';
  status: 'done' | 'skipped' | 'too_hard';
  rating: number | null;
}[] = [
  { offset: -11, day: 1, mode: 'normal', status: 'done', rating: 4 },
  { offset: -10, day: 2, mode: 'normal', status: 'done', rating: 5 },
  { offset: -9, day: 3, mode: 'normal', status: 'skipped', rating: null },
  { offset: -8, day: 3, mode: 'normal', status: 'done', rating: 4 },
  { offset: -7, day: 4, mode: 'normal', status: 'done', rating: 3 },
  { offset: -6, day: 5, mode: 'minimal', status: 'done', rating: 4 },
  { offset: -5, day: 6, mode: 'normal', status: 'done', rating: 5 },
  { offset: -4, day: 7, mode: 'normal', status: 'too_hard', rating: null },
  { offset: -3, day: 7, mode: 'normal', status: 'done', rating: 3 },
  { offset: -2, day: 8, mode: 'normal', status: 'done', rating: 4 },
  { offset: -1, day: 9, mode: 'normal', status: 'done', rating: 5 },
];

const REFLECTIONS = [
  "J'ai écrit mon objectif noir sur blanc.",
  'Deux appels de prospection passés.',
  'Journée chargée, rien de spécial.',
  'Bloc de travail profond le matin : efficace.',
  'Fatigué, mais j’ai gardé le rythme.',
  'Version courte faite, ça suffit.',
  'Rendez-vous client calé pour la semaine prochaine.',
  'Exercice trop long aujourd’hui.',
  'Repris l’exercice d’hier, fait.',
  'Une proposition envoyée.',
  'Bonne journée, objectif plus clair.',
];

async function main() {
  const today = localClock(new Date(), TIMEZONE).date;
  const start = addDays(today, -11);

  // Recreate the demo and admin users (the admin's TOTP factor goes with it)
  const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  for (const email of [DEMO_EMAIL, ADMIN_EMAIL]) {
    const existing = listed.data.users.find((u) => u.email === email);
    if (existing) {
      const removed = await db.auth.admin.deleteUser(existing.id);
      if (removed.error) throw removed.error;
    }
  }
  const createdAdmin = await db.auth.admin.createUser({
    email: ADMIN_EMAIL,
    email_confirm: true,
    user_metadata: { locale: 'fr', timezone: TIMEZONE, display_name: 'Admin' },
  });
  if (createdAdmin.error || !createdAdmin.data.user) throw createdAdmin.error;
  must(
    await db
      .from('profiles')
      .update({
        role: 'admin',
        onboarded_at: new Date().toISOString(),
        persona: 'entrepreneur',
        program_id: 'PR1',
        program_start_date: today,
        program_day: 1,
        level: 'beginner',
        daily_minutes: 15,
      })
      .eq('user_id', createdAdmin.data.user.id)
      .select('user_id'),
    'admin profile',
  );
  const createdUser = await db.auth.admin.createUser({
    email: DEMO_EMAIL,
    email_confirm: true,
    user_metadata: { locale: 'fr', timezone: TIMEZONE, display_name: 'Alex' },
  });
  if (createdUser.error) throw createdUser.error;
  const created = createdUser.data.user;
  if (!created) throw new Error('demo user not created');
  const userId = created.id;

  // Catalogue: PR1 steps and exercises
  const steps = must(
    await db
      .from('program_steps')
      .select('day_index, principle_id, main_exercise_id, minimal_exercise_id, theme_fr')
      .eq('program_id', 'PR1'),
    'program_steps',
  );
  const exercises = must(await db.from('exercises').select('id, proof_type'), 'exercises');
  const proofOf = (id: string) => exercises.find((e) => e.id === id)?.proof_type ?? 'checkbox';

  must(
    await db
      .from('profiles')
      .update({
        onboarded_at: at(start, 8),
        situation: 'entrepreneur',
        priority_domains: ['business_career', 'clarity_goals'],
        blockers: ['procrastination'],
        // Optimistic at onboarding: about 16 min a day in reality (weekly review proposal)
        daily_minutes: 45,
        chronotype: 'morning',
        motivation_style: 'challenge',
        level: 'beginner',
        persona: 'entrepreneur',
        program_id: 'PR1',
        program_start_date: start,
        program_day: 10,
        notify_morning: '07:30',
        notify_evening: '21:00',
        consent_checkin: true,
        consent_at: at(start, 8),
      })
      .eq('user_id', userId)
      .select('user_id'),
    'profile',
  );

  // Goal (current value entered today: trusted by the engine and the review)
  must(
    await db
      .from('goals')
      .insert({
        user_id: userId,
        title: 'Signer 5 nouveaux clients',
        why: 'Rendre mon activité rentable',
        target_value: 5,
        unit: 'clients',
        current_value: 1,
        deadline: addDays(today, 30),
        created_at: at(start, 8),
      })
      .select('id'),
    'goal',
  );

  // Habits: H19 kept up, H21 rarely done (weekly review proposal), H01 regular
  const templates = must(
    await db.from('habit_templates').select('id, frequency').in('id', ['H19', 'H21', 'H01']),
    'templates',
  );
  const habits = must(
    await db
      .from('user_habits')
      .insert(
        ['H19', 'H21', 'H01'].map((id) => ({
          user_id: userId,
          template_id: id,
          frequency: templates.find((t) => t.id === id)?.frequency ?? 'daily',
          created_at: at(start, 8),
        })),
      )
      .select('id, template_id'),
    'user_habits',
  );
  const habitId = (template: string) => habits.find((h) => h.template_id === template)?.id ?? '';

  for (const [index, entry] of HISTORY.entries()) {
    const date = addDays(today, entry.offset);
    const step = steps.find((s) => s.day_index === entry.day);
    if (!step) throw new Error(`missing PR1 step ${entry.day}`);
    const exerciseId = entry.mode === 'minimal' ? step.minimal_exercise_id : step.main_exercise_id;
    const proofType = proofOf(exerciseId);
    const plan = must(
      await db
        .from('daily_plans')
        .insert({
          user_id: userId,
          date,
          mode: entry.mode,
          program_day: entry.day,
          program_id: 'PR1',
          principle_id: step.principle_id,
          why_today:
            entry.mode === 'minimal'
              ? 'Ton énergie était basse hier : voici une version courte pour garder le rythme.'
              : `Semaine ${Math.floor((entry.day - 1) / 7) + 1} de ton programme : ${step.theme_fr.charAt(0).toLowerCase()}${step.theme_fr.slice(1)}.`,
          generated_at: at(date, 2),
          created_at: at(date, 2),
        })
        .select('id')
        .single(),
      'daily_plan',
    );
    must(
      await db
        .from('plan_items')
        .insert({
          plan_id: plan.id,
          user_id: userId,
          exercise_id: exerciseId,
          position: 1,
          status: entry.status,
          rating: entry.status === 'done' ? entry.rating : null,
          proof_value:
            entry.status !== 'done' || proofType === 'checkbox'
              ? null
              : proofType === 'numeric'
                ? '3'
                : REFLECTIONS[index],
          completed_at: entry.status === 'done' ? at(date, 9) : null,
        })
        .select('id'),
      'plan_item',
    );
    must(
      await db
        .from('engine_decisions')
        .insert({
          user_id: userId,
          plan_id: plan.id,
          rules_fired:
            entry.mode === 'minimal' ? ['minimal_low_energy', 'program_step'] : ['program_step'],
          why: { key: entry.mode === 'minimal' ? 'low_energy' : 'program_week', params: {} },
          created_at: at(date, 2),
        })
        .select('id'),
      'engine_decision',
    );

    // Habits: H19 most days, H21 twice, H01 regularly (some minimal versions)
    const logs = [
      ...(entry.offset !== -9 && entry.offset !== -4 ? [{ habit: 'H19', minimal: false }] : []),
      ...(entry.offset === -10 || entry.offset === -3 ? [{ habit: 'H21', minimal: false }] : []),
      ...(entry.offset % 2 === 0 ? [{ habit: 'H01', minimal: entry.offset === -6 }] : []),
    ];
    if (logs.length > 0) {
      must(
        await db
          .from('habit_logs')
          .insert(
            logs.map((l) => ({
              user_habit_id: habitId(l.habit),
              user_id: userId,
              date,
              done: true,
              minimal: l.minimal,
            })),
          )
          .select('date'),
        'habit_logs',
      );
    }

    // Evening check-in (none on the two skipped days); low energy on J-7
    if (entry.status !== 'skipped') {
      must(
        await db
          .from('checkins')
          .insert({
            user_id: userId,
            date,
            energy: entry.offset === -7 ? 2 : entry.offset % 3 === 0 ? 3 : 4,
            mood: entry.offset === -7 ? 3 : 4,
            minutes_tomorrow: entry.offset === -7 ? 15 : 30,
            reflection: REFLECTIONS[index],
          })
          .select('date'),
        'checkin',
      );
    }
  }

  // Last week's review (same shared code as the server)
  const profile = must(
    await db.from('profiles').select('*').eq('user_id', userId).single(),
    'profile',
  );
  const weekStart = addDays(mondayOf(today), -7);
  const review = await generateReviewForUser(db, profile, weekStart);
  const saved = review.reviewId
    ? must(
        await db.from('weekly_reviews').select('proposals').eq('id', review.reviewId).single(),
        'review',
      )
    : null;

  console.log(`✅ Demo user ${DEMO_EMAIL} (PR1, day 10 today, ${HISTORY.length} days of history)`);
  console.log(
    `   Review of the week of ${weekStart}: ${review.status}, proposals: ${JSON.stringify((saved?.proposals as { type: string }[] | undefined)?.map((p) => p.type) ?? [])}`,
  );
  console.log(`✅ Admin ${ADMIN_EMAIL} (role admin, two-factor setup on first access)`);
  console.log('   Sign in with the 6-digit code from Mailpit: http://127.0.0.1:54324');
}

await main();
