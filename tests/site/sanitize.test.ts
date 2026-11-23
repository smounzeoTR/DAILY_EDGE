import { describe, expect, it } from 'vitest';

import { cleanProperties, cleanUrl, sanitizeEvent } from '../../site/src/scripts/sanitize.ts';

describe('PostHog event filtering', () => {
  it('drops any value that looks like an e-mail, at any depth', () => {
    const out = cleanProperties({
      plan: 'PR4',
      note: 'contact camille.dupont@example.fr please',
      nested: { a: 'x@y.fr', b: 'ok' },
      list: ['a@b.co', 'kept'],
    });
    expect(out).toEqual({ plan: 'PR4', nested: { b: 'ok' }, list: ['kept'] });
    expect(JSON.stringify(out)).not.toContain('@');
  });

  it('drops the properties of the denylist', () => {
    expect(cleanProperties({ email: 'nothing', $email: 'x', Name: 'Camille', step: 3 })).toEqual({
      step: 3,
    });
  });

  it('URLs lose their fragment (tokens) and every parameter except utm_* and ref', () => {
    expect(
      cleanUrl('https://dailyedge.fr/confirmer?utm_source=gdiy&email=a%40b.fr&x=1#t=SECRETTOKEN'),
    ).toBe('https://dailyedge.fr/confirmer?utm_source=gdiy');
    expect(cleanUrl('https://dailyedge.fr/?ref=AB2CD3')).toBe('https://dailyedge.fr/?ref=AB2CD3');
    expect(cleanUrl('not a url')).toBe('');
  });

  it('before_send cleans $current_url, $referrer, $set and drops an event named with an e-mail', () => {
    const event = sanitizeEvent({
      event: '$pageview',
      properties: {
        $current_url: 'https://dailyedge.fr/ma-place#s=STATUSTOKEN',
        $referrer: 'https://mail.example/?to=a@b.fr',
      },
      $set: { email: 'a@b.fr', plan: 'x' },
    });
    expect(event?.properties).toEqual({
      $current_url: 'https://dailyedge.fr/ma-place',
      $referrer: 'https://mail.example/',
    });
    expect(event?.$set).toEqual({ plan: 'x' });
    expect(sanitizeEvent({ event: 'signup a@b.fr' })).toBeNull();
  });
});
