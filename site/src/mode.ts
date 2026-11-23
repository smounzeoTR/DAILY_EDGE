// Site mode at build time (pure, tested in tests/site/mode.test.ts):
// - SITE_MODE_OVERRIDE ("waitlist" | "launch") wins (manual switch, one-click rollback);
// - otherwise "launch" from SITE_LAUNCH_AT (ISO date with offset), "waitlist" before.
export type SiteMode = 'waitlist' | 'launch';

export const DEFAULT_LAUNCH_AT = '2027-01-04T00:00:00+01:00';

export function resolveSiteMode(input: {
  override?: string | undefined;
  launchAt?: string | undefined;
  now?: Date;
}): SiteMode {
  if (input.override === 'waitlist' || input.override === 'launch') return input.override;
  const launchAt = new Date(input.launchAt || DEFAULT_LAUNCH_AT);
  if (Number.isNaN(launchAt.getTime()))
    throw new Error(`invalid SITE_LAUNCH_AT: ${input.launchAt}`);
  return (input.now ?? new Date()).getTime() >= launchAt.getTime() ? 'launch' : 'waitlist';
}
