// Checks that, after `seed:demo`, no weekly review would be generated for the demo account during
// the next 24 hours (neither by generate-review when the app opens nor by the hourly batch).
// Run after seeding, with the same simulated time: DEMO_NOW=2026-11-22T17:30:00+01:00
//   DEMO_NOW=... npm run seed:demo && DEMO_NOW=... node scripts/seed-demo/check-review-window.ts
import { execSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../supabase/functions/_shared/database.types.ts';
import {
  localClock,
  reviewWeekStart,
} from '../../supabase/functions/_shared/review/generateReview.ts';
import { assertLocal } from './guard.ts';

const DEMO_EMAIL = 'demo@daily-edge.local';
const TIMEZONE = 'Europe/Paris';
const HOURS = [0, 0.5, 1, 2, 4, 8, 12, 24];

type Status = { API_URL: string; SERVICE_ROLE_KEY: string };
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Status;
assertLocal(status.API_URL);
const db = createClient<Database>(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const start = process.env.DEMO_NOW ? new Date(process.env.DEMO_NOW) : new Date();
const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
const demo = users.data?.users.find((u) => u.email === DEMO_EMAIL);
if (!demo) throw new Error('demo user missing: run npm run seed:demo first');
const { data: reviews, error } = await db
  .from('weekly_reviews')
  .select('week_start')
  .eq('user_id', demo.id);
if (error) throw error;
const existing = new Set((reviews ?? []).map((r) => r.week_start));

let failures = 0;
for (const hours of HOURS) {
  const at = new Date(start.getTime() + hours * 3_600_000);
  const clock = localClock(at, TIMEZONE);
  const due = reviewWeekStart(clock);
  const batch = await db.rpc('users_due_for_review', { p_now: at.toISOString(), p_limit: 1000 });
  if (batch.error) throw batch.error;
  const batchWants = (batch.data ?? []).some((r) => r.user_id === demo.id);
  const ok = existing.has(due) && !batchWants;
  if (!ok) failures += 1;
  console.log(
    `${ok ? '✅' : '❌'} ${clock.date} ${String(clock.hour).padStart(2, '0')}h (day ${clock.isoDay}): ` +
      `review ${due} ${existing.has(due) ? 'present' : 'MISSING'}, batch ${batchWants ? 'WOULD GENERATE' : 'idle'}`,
  );
}
if (failures > 0) process.exit(1);
