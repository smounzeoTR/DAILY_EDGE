// Audience measurement with PostHog (EU instance). Loaded only when PUBLIC_POSTHOG_KEY is set.
// - No choice yet or refused: cookieless mode (PostHog counts visitors with a server-side hash,
//   nothing about the visitor is stored except PostHog's own opt-out flag).
// - Accepted: opt_in_capturing(), PostHog may store an anonymous identifier.
// Never identify(), no session replay, no autocapture of fields; every event goes through
// sanitizeEvent (no e-mail, no URL fragment, only utm_* and ref parameters).
import { PUBLIC_POSTHOG_KEY } from 'astro:env/client';

import { readConsent, writeConsent, type Consent } from './consent';
import { PROPERTY_DENYLIST, sanitizeEvent } from './sanitize';

type PostHogLike = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
};

export type SiteEvent =
  | 'landing_view'
  | 'cta_clicked'
  | 'waitlist_joined'
  | 'waitlist_confirmed'
  | 'referral_shared'
  | 'quiz_started'
  | 'quiz_step'
  | 'quiz_completed'
  | 'email_captured'
  | 'store_clicked'
  | 'equipes_view'
  | 'equipes_meeting_requested';

let posthog: PostHogLike | null = null;
let loading: Promise<PostHogLike | null> | null = null;
const queue: [SiteEvent, Record<string, unknown>][] = [];

export const analyticsEnabled = PUBLIC_POSTHOG_KEY !== '';

function applyConsent(ph: PostHogLike, consent: Consent) {
  // No choice yet = refusal: anonymous cookieless measurement only
  if (consent === 'granted') ph.opt_in_capturing();
  else ph.opt_out_capturing();
}

function load(): Promise<PostHogLike | null> {
  if (!analyticsEnabled) return Promise.resolve(null);
  loading ??= import('posthog-js/dist/module.slim.no-external').then(({ default: ph }) => {
    ph.init(PUBLIC_POSTHOG_KEY, {
      api_host: 'https://eu.i.posthog.com',
      ui_host: 'https://eu.posthog.com',
      cookieless_mode: 'on_reject',
      person_profiles: 'never',
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: false,
      capture_dead_clicks: false,
      rageclick: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      // Plain JSON payloads (tiny): anyone can check in the browser that no e-mail leaves
      disable_compression: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      property_denylist: PROPERTY_DENYLIST,
      before_send: (event) => sanitizeEvent(event),
    });
    const instance = ph as unknown as PostHogLike;
    applyConsent(instance, readConsent());
    posthog = instance;
    for (const [event, properties] of queue.splice(0)) instance.capture(event, properties);
    return instance;
  });
  return loading;
}

export function track(event: SiteEvent, properties: Record<string, unknown> = {}): void {
  if (!analyticsEnabled) return;
  if (posthog) posthog.capture(event, properties);
  else {
    queue.push([event, properties]);
    void load();
  }
}

export function setConsent(choice: 'denied' | 'granted'): void {
  writeConsent(choice);
  if (posthog) applyConsent(posthog, choice);
  else void load();
}

export function startAnalytics(): void {
  if (!analyticsEnabled) return;
  // Clicks marked in the markup: calls to action, store buttons, meeting requests
  document.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-cta], [data-store], [data-meeting]',
    );
    if (!target) return;
    if (target.dataset.cta) track('cta_clicked', { cta: target.dataset.cta });
    if (target.dataset.store) track('store_clicked', { platform: target.dataset.store });
    if (target.dataset.meeting !== undefined) track('equipes_meeting_requested');
  });
  const load_ = () => void load();
  if ('requestIdleCallback' in window) window.requestIdleCallback(load_, { timeout: 3000 });
  else setTimeout(load_, 1500);
}
