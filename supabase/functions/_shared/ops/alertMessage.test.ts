import { describe, expect, it } from 'vitest';

import { buildAlertEmail } from './alertMessage.ts';

describe('operations alert e-mail', () => {
  it('lists each alert in plain French with the environment', () => {
    const { subject, text } = buildAlertEmail(
      [
        { kind: 'batch_missing', day: '2026-12-01', detail: { last_run: null }, created_at: '' },
        {
          kind: 'ai_cost',
          day: '2026-12-01',
          detail: { cost_eur: 6.2, threshold_eur: 5 },
          created_at: '',
        },
      ],
      'recette',
    );
    expect(subject).toBe("[Daily Edge recette] 2 alertes d'exploitation");
    expect(text).toContain('Environnement : recette');
    expect(text).toContain('absente depuis plus de 2 h (dernier passage : aucun)');
    expect(text).toContain('6.2 €, au-dessus du seuil de 5 €');
  });

  it('singular subject for one alert', () => {
    const { subject } = buildAlertEmail(
      [{ kind: 'batch_failed', day: '2026-12-01', detail: {}, created_at: '' }],
      'production',
    );
    expect(subject).toBe("[Daily Edge production] 1 alerte d'exploitation");
  });
});
