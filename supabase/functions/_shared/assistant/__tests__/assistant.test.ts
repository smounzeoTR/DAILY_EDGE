import { describe, expect, it } from 'vitest';

import { createMockProvider } from '../../llm/mock.ts';
import type { LlmStreamEvent } from '../../llm/types.ts';
import { localDayBounds } from '../chat.ts';
import { claimsCard, usesVous } from '../claims.ts';
import { buildAssistantContext } from '../context.ts';
import { createIdentifierFilter, removeIdentifiers } from '../sanitize.ts';
import { ASSISTANT_PROMPT_VERSION, buildSystemPrompt } from '../prompt.ts';
import { TOOL_DEFINITIONS, TOOL_SCHEMAS, WRITE_TOOLS } from '../tools.ts';

describe('assistant context (data minimization)', () => {
  it('never contains the name, e-mail, ids, reflections, notes or proofs', () => {
    const context = buildAssistantContext({
      language: 'fr',
      profile: {
        user_id: 'u-123',
        display_name: 'Camille Martin',
        email: 'camille@example.com',
        situation: 'entrepreneur',
        level: 'beginner',
        daily_minutes: 30,
        notes: [{ body: 'CARNET_SECRET' }],
      },
      goal: {
        title: 'Signer 5 clients',
        why: 'Vivre de mon activité',
        current_value: 1,
        user_id: 'u-123',
      },
      checkins: [
        {
          date: '2026-11-20',
          energy: 3,
          mood: 4,
          minutes_tomorrow: 30,
          reflection: 'REFLEXION_SECRETE',
          note: 'NOTE',
        },
      ],
      today: {
        date: '2026-11-21',
        mode: 'normal',
        programDay: 3,
        principleTitle: 'Le travail en profondeur',
        adjustedByUser: false,
        items: [
          {
            exercise_id: 'E001',
            title: 'Écrire',
            duration_min: 10,
            status: 'done',
            origin: 'engine',
            proof_value: 'PREUVE_SECRETE',
          },
        ],
        habits: [{ title: 'Lire', done: true, cue: 'SIGNAL_PRIVE' }],
        checkinDone: true,
        minutesAvailable: 30,
      },
    });
    const sent = buildSystemPrompt('fr', context, null);
    for (const secret of [
      'Camille',
      'camille@example.com',
      'u-123',
      'CARNET_SECRET',
      'REFLEXION_SECRETE',
      'PREUVE_SECRETE',
      'SIGNAL_PRIVE',
      '"NOTE"',
    ]) {
      expect(sent).not.toContain(secret);
    }
    expect(context.goal).toMatchObject({ title: 'Signer 5 clients', current_value: 1 });
    expect(context.today?.exercises[0]).toEqual({
      exercise_id: 'E001',
      title: 'Écrire',
      duration_min: 10,
      status: 'done',
      added_by_user: false,
    });
  });

  it('the system prompt is versioned and frames the context as data', () => {
    expect(ASSISTANT_PROMPT_VERSION).toMatch(/^coach-v\d+$/);
    const prompt = buildSystemPrompt('en', { x: 1 }, 'previous summary');
    expect(prompt).toContain('Language: en');
    expect(prompt).toContain('<user_context>');
    expect(prompt).toContain('<conversation_summary>');
    expect(prompt).toMatch(/DATA/);
  });
});

describe('tools', () => {
  it('every tool has a definition and a strict schema', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual(Object.keys(TOOL_SCHEMAS).sort());
    expect(WRITE_TOOLS).toEqual([
      'adapt_today',
      'swap_exercise',
      'save_exercise_result',
      'add_habit',
      'update_goal_progress',
    ]);
  });
  it('invalid parameters are refused', () => {
    expect(TOOL_SCHEMAS.adapt_today.safeParse({ minutes: 0 }).success).toBe(false);
    expect(TOOL_SCHEMAS.adapt_today.safeParse({ minutes: 10, extra: 1 }).success).toBe(false);
    expect(
      TOOL_SCHEMAS.save_exercise_result.safeParse({ exercise_id: 'E1', status: 'todo' }).success,
    ).toBe(false);
    expect(
      TOOL_SCHEMAS.save_exercise_result.safeParse({ exercise_id: 'E1', status: 'done', rating: 6 })
        .success,
    ).toBe(false);
    expect(TOOL_SCHEMAS.update_goal_progress.safeParse({ value: -1 }).success).toBe(false);
    expect(TOOL_SCHEMAS.search_catalog.safeParse({ limit: 50 }).success).toBe(false);
    expect(TOOL_SCHEMAS.swap_exercise.safeParse({ exercise_id: 'E042' }).success).toBe(true);
  });
});

describe('local day of the user', () => {
  it('Paris: day bounds in UTC, with daylight saving time', () => {
    expect(localDayBounds('Europe/Paris', new Date('2026-11-21T22:30:00Z'))).toEqual({
      date: '2026-11-21',
      start: '2026-11-20T23:00:00.000Z',
      end: '2026-11-21T23:00:00.000Z',
    });
    expect(localDayBounds('Europe/Paris', new Date('2026-07-01T10:00:00Z')).end).toBe(
      '2026-07-01T22:00:00.000Z',
    );
  });
  it('New York', () => {
    expect(localDayBounds('America/New_York', new Date('2026-11-22T03:00:00Z')).date).toBe(
      '2026-11-21',
    );
  });
});

describe('mock provider (assistant stream)', () => {
  const collect = async (it: AsyncIterable<LlmStreamEvent>) => {
    const events: LlmStreamEvent[] = [];
    for await (const e of it) events.push(e);
    return events;
  };
  it('streams text word by word', async () => {
    const mock = createMockProvider();
    const events = await collect(
      mock.stream!({
        system: 'Language: fr',
        messages: [{ role: 'user', content: 'Bonjour' }],
        maxTokens: 100,
      }),
    );
    expect(events.filter((e) => e.type === 'text_delta').length).toBeGreaterThan(3);
    expect(events.at(-1)?.type).toBe('done');
  });
  it('calls a write tool when the user has little time, never with toolChoice none', async () => {
    const mock = createMockProvider();
    const request = {
      system: 'Language: fr',
      messages: [{ role: 'user' as const, content: "Je n'ai que 10 minutes" }],
      tools: TOOL_DEFINITIONS,
      maxTokens: 100,
    };
    const events = await collect(mock.stream!(request));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'tool_use',
        block: expect.objectContaining({ name: 'adapt_today' }),
      }),
    );
    const none = await collect(mock.stream!({ ...request, toolChoice: 'none' }));
    expect(none.some((e) => e.type === 'tool_use')).toBe(false);
  });
});

describe('internal identifiers never shown', () => {
  it('removes codes, with or without parentheses', () => {
    expect(removeIdentifiers('Essaie « Découper l’objectif » (E033) aujourd’hui.')).toBe(
      'Essaie « Découper l’objectif » aujourd’hui.',
    );
    expect(removeIdentifiers('L’habitude H27 et le principe P002, programme PR1.')).toBe(
      'L’habitude et le principe, programme.',
    );
    expect(removeIdentifiers('Elle Prend Huit Semaines')).toBe('Elle Prend Huit Semaines');
  });
  it('holds an identifier cut between two chunks', () => {
    const f = createIdentifierFilter();
    const shown = [
      f.push('Je te propose (E0'),
      f.push('33) : un bloc de 10 min. '),
      f.flush(),
    ].join('');
    expect(shown).toBe('Je te propose : un bloc de 10 min. ');
    const g = createIdentifierFilter();
    expect([g.push('Habitude H'), g.push('27 ajoutée'), g.flush()].join('')).toBe(
      'Habitude ajoutée',
    );
  });
});

describe('card announced without an action', () => {
  it.each([
    'Touche « Appliquer » sur la carte.',
    'La carte est prête.',
    'Tap "Apply" to confirm.',
    'I prepared a card for you.',
  ])('flags "%s"', (text) => {
    expect(claimsCard(text)).toBe(true);
  });
  it.each([
    'Pour appliquer ce principe, commence petit.',
    'Applique-le dès demain matin.',
    'Apply this idea to your goal.',
    'Ta journée tient déjà dans 10 minutes.',
    // General explanations of how cards work (eval n° 10 and 13)
    'Quand je te propose une action, une carte apparaît avec « Appliquer » et « Annuler ».',
    'Si tu veux changer quelque chose, je te prépare une carte et tu touches « Appliquer ».',
    'When I suggest a change, a card shows up with "Apply" and "Cancel".',
  ])('does not flag "%s"', (text) => {
    expect(claimsCard(text)).toBe(false);
  });
});

describe('"vous" addressed to the user', () => {
  it.each(['Comment allez-vous ?', 'Je vous propose une version courte.'])('flags "%s"', (t) => {
    expect(usesVous(t)).toBe(true);
  });
  it.each([
    'Toi et ta sœur, vous semblez proches.',
    'Votre relation compte beaucoup pour toi.',
    'Vous deux avez le droit de ne pas être d’accord.',
    'Tu peux en parler avec elle.',
  ])('does not flag "%s"', (t) => {
    expect(usesVous(t)).toBe(false);
  });
});
