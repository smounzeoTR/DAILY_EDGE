// Waitlist operations on the database (service role). Shared by waitlist-join, waitlist-confirm
// and waitlist-status. The client is untyped until database.types.ts is regenerated at merge.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Mailer } from '../mailer/mailer.ts';
import { alreadyConfirmedEmail, confirmEmail, confirmUrl, statusUrl } from './emails.ts';
import { generateReferralCode } from './referral.ts';
import type { JoinInput } from './schemas.ts';
import { generateToken, hashToken, tokenExpiry } from './token.ts';

type Db = SupabaseClient<any, any, any>;

const UNIQUE_VIOLATION = '23505';

export interface WaitlistPlace {
  rank: number | null;
  referral_code: string;
  confirmed_referrals: number;
}

async function issueToken(db: Db, entryId: string, kind: 'confirm' | 'status', now: Date) {
  const token = generateToken();
  const { error } = await db.from('waitlist_tokens').insert({
    token_hash: await hashToken(token),
    entry_id: entryId,
    kind,
    expires_at: tokenExpiry(kind, now).toISOString(),
  });
  if (error) throw new Error(`token insert failed: ${error.message}`);
  return token;
}

/** A new confirmation link replaces the previous ones (only the latest one works). */
async function renewConfirmToken(db: Db, entryId: string, now: Date) {
  const { error } = await db
    .from('waitlist_tokens')
    .update({ used_at: now.toISOString() })
    .eq('entry_id', entryId)
    .eq('kind', 'confirm')
    .is('used_at', null);
  if (error) throw new Error(`token revoke failed: ${error.message}`);
  return issueToken(db, entryId, 'confirm', now);
}

async function referrerExists(db: Db, code: string | null | undefined): Promise<string | null> {
  if (!code) return null;
  const { data, error } = await db
    .from('waitlist_entries')
    .select('id')
    .eq('referral_code', code)
    .maybeSingle();
  if (error) throw new Error(`referrer lookup failed: ${error.message}`);
  return data ? code : null;
}

async function insertEntry(db: Db, input: JoinInput, now: Date) {
  const referredBy = await referrerExists(db, input.ref);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from('waitlist_entries')
      .insert({
        email: input.email,
        referral_code: generateReferralCode(),
        referred_by: referredBy,
        utm_source: input.utm_source ?? null,
        utm_medium: input.utm_medium ?? null,
        utm_campaign: input.utm_campaign ?? null,
        landing_path: input.landing_path ?? null,
        consent_marketing: true,
        consent_at: now.toISOString(),
        locale: input.locale,
      })
      .select('id')
      .single();
    if (!error) return { id: data.id as string, created: true };
    if (error.code !== UNIQUE_VIOLATION) throw new Error(`entry insert failed: ${error.message}`);
    // Same e-mail inserted concurrently: handled as an existing entry
    if (error.message.includes('email')) return null;
    // Otherwise a referral code collision: try another code
  }
  throw new Error('no free referral code');
}

/**
 * Sign-up. The caller always answers the same way, whatever the address's state:
 * new or pending → confirmation e-mail; unsubscribed → back to pending, confirmation e-mail;
 * confirmed → e-mail with a link to see one's place.
 */
export async function joinWaitlist(
  db: Db,
  mailer: Mailer,
  siteUrl: string,
  input: JoinInput,
  now = new Date(),
): Promise<void> {
  const { data: existing, error } = await db
    .from('waitlist_entries')
    .select('id, status')
    .eq('email', input.email)
    .maybeSingle();
  if (error) throw new Error(`entry lookup failed: ${error.message}`);

  let entry = existing as { id: string; status: string } | null;
  if (!entry) {
    const inserted = await insertEntry(db, input, now);
    if (inserted) {
      entry = { id: inserted.id, status: 'pending' };
    } else {
      const { data } = await db
        .from('waitlist_entries')
        .select('id, status')
        .eq('email', input.email)
        .single();
      entry = data as { id: string; status: string };
    }
  }

  if (entry.status === 'confirmed') {
    const token = await issueToken(db, entry.id, 'status', now);
    const mail = alreadyConfirmedEmail(statusUrl(siteUrl, token));
    await mailer.send({ to: input.email, ...mail });
    return;
  }

  // Pending or unsubscribed: fresh consent, back to pending (first-touch UTM and referrer kept)
  const { error: updateError } = await db
    .from('waitlist_entries')
    .update({ status: 'pending', consent_marketing: true, consent_at: now.toISOString() })
    .eq('id', entry.id)
    .neq('status', 'confirmed');
  if (updateError) throw new Error(`entry update failed: ${updateError.message}`);
  const token = await renewConfirmToken(db, entry.id, now);
  const mail = confirmEmail(confirmUrl(siteUrl, token));
  await mailer.send({ to: input.email, ...mail });
}

/** Confirmation: null when the link is unknown, expired or already used. */
export async function confirmWaitlist(
  db: Db,
  token: string,
  now = new Date(),
): Promise<(WaitlistPlace & { status_token: string }) | null> {
  const { data, error } = await db.rpc('confirm_waitlist_entry', {
    p_token_hash: await hashToken(token),
  });
  if (error) throw new Error(`confirm failed: ${error.message}`);
  const entry = (data as any[] | null)?.[0];
  if (!entry || entry.status !== 'confirmed') return null;
  const statusToken = await issueToken(db, entry.id, 'status', now);
  return {
    rank: entry.rank,
    referral_code: entry.referral_code,
    confirmed_referrals: entry.confirmed_referrals,
    status_token: statusToken,
  };
}

/** Current place for a status token; null when the token is unknown or expired. */
export async function waitlistStatus(
  db: Db,
  statusToken: string,
  now = new Date(),
): Promise<WaitlistPlace | null> {
  const { data, error } = await db
    .from('waitlist_tokens')
    .select(
      'entry_id, expires_at, waitlist_entries (status, rank, referral_code, confirmed_referrals)',
    )
    .eq('token_hash', await hashToken(statusToken))
    .eq('kind', 'status')
    .gt('expires_at', now.toISOString())
    .maybeSingle();
  if (error) throw new Error(`status lookup failed: ${error.message}`);
  const entry = (data as any)?.waitlist_entries;
  if (!entry || entry.status !== 'confirmed') return null;
  return {
    rank: entry.rank,
    referral_code: entry.referral_code,
    confirmed_referrals: entry.confirmed_referrals,
  };
}
