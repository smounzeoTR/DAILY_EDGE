import { describe, expect, it } from 'vitest';

import { scrubBreadcrumb, scrubEvent, scrubText } from './scrub';

describe('monitoring without personal data', () => {
  it('removes e-mails, tokens, ids and query strings', () => {
    expect(
      scrubText(
        'Failed for camille@example.com id 6fb12ef2-bc26-4889-ba85-1467cff26f20 token eyJabc.def.ghi at /x?email=a',
      ),
    ).toBe('Failed for [email] id [id] token [token] at /x');
  });

  it('drops the user, the request and extra data; scrubs messages', () => {
    const event = scrubEvent({
      user: { id: 'u1', email: 'a@b.fr' },
      request: { data: '{"reflection":"secret"}' },
      extra: { note: 'secret' },
      message: 'Error for a@b.fr',
      exception: { values: [{ value: 'Bad token eyJa.b.c' }] },
      contexts: { device: { name: "Camille's iPhone", model: 'iPhone' } },
      breadcrumbs: [
        { category: 'ui.input', message: 'typed secret' },
        { category: 'navigation', message: '/coach/abc?prefill=secret', data: { to: '/x' } },
        { category: 'console', message: 'log' },
      ],
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.message).toBe('Error for [email]');
    expect(event.exception?.values?.[0]?.value).toBe('Bad token [token]');
    expect(event.contexts?.device).toEqual({ model: 'iPhone', name: undefined });
    expect(event.breadcrumbs).toEqual([
      { category: 'navigation', message: '/coach/abc', data: undefined },
    ]);
  });

  it('typed text and console breadcrumbs are dropped', () => {
    expect(scrubBreadcrumb({ category: 'ui.input', message: 'x' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'fetch', message: 'x' })).toBeNull();
  });
});
