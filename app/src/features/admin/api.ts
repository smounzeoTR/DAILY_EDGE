// Administration (read only): admin RPCs and the two-factor session (TOTP, aal2).
// The database refuses every admin RPC without the admin role AND an aal2 session.
import { supabase } from '@/lib/supabase';

export async function assuranceLevel(): Promise<{ current: string | null; next: string | null }> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return { current: data.currentLevel, next: data.nextLevel };
}

// Verified TOTP factor, if any (unverified leftovers of an aborted enrolment are removed)
export async function verifiedTotpFactor(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  for (const factor of data.all) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  return data.totp[0]?.id ?? null;
}

export type Enrolment = { factorId: string; qrSvg: string; secret: string };

export async function enrollTotp(): Promise<Enrolment> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Daily Edge admin ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw error;
  // qr_code is an SVG data URI
  const raw = data.totp.qr_code;
  const svg = raw.startsWith('data:') ? decodeURIComponent(raw.slice(raw.indexOf(',') + 1)) : raw;
  return { factorId: data.id, qrSvg: svg, secret: data.totp.secret };
}

// Upgrades the session to aal2
export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
}

export async function exerciseStats(from: string, to: string) {
  const { data, error } = await supabase.rpc('admin_exercise_stats', { p_from: from, p_to: to });
  if (error) throw error;
  return data ?? [];
}

export async function engineLog(email: string) {
  const { data, error } = await supabase.rpc('admin_engine_log', { p_email: email, p_limit: 30 });
  if (error) throw error;
  return data ?? [];
}

export async function aiCostDaily(days: number) {
  const { data, error } = await supabase.rpc('admin_ai_cost_daily', { p_days: days });
  if (error) throw error;
  return data ?? [];
}

export type ExerciseStat = Awaited<ReturnType<typeof exerciseStats>>[number];
export type EngineLogRow = Awaited<ReturnType<typeof engineLog>>[number];
export type AiCostRow = Awaited<ReturnType<typeof aiCostDaily>>[number];
