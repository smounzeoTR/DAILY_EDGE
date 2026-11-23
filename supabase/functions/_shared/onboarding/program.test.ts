import { describe, expect, it } from 'vitest';

import * as app from '../../../../app/src/features/onboarding/rules.ts';
import { assignPersona, DOMAINS, selectProgram, SITUATIONS, type ProgramRow } from './program.ts';

const programs: ProgramRow[] = [
  { id: 'PR1', persona: 'entrepreneur' },
  { id: 'PR2', persona: 'employee' },
  { id: 'PR3', persona: 'career_changer' },
  { id: 'PR4', persona: 'financial_beginner' },
];

describe('program assignment: shared rule = app copy (until lot S3b)', () => {
  for (const domain of DOMAINS) {
    for (const situation of [...SITUATIONS, null]) {
      it(`${domain} × ${situation ?? 'passée'}`, () => {
        const answers = { priorityDomains: [domain], situation };
        const shared = selectProgram(assignPersona(answers), programs);
        const fromApp = app.selectProgram(app.assignPersona(answers), programs);
        expect(shared?.id).toBeDefined();
        expect(shared?.id).toBe(fromApp?.id);
      });
    }
  }

  it('money first → PR4 whatever the situation; otherwise the situation decides', () => {
    expect(
      selectProgram(
        assignPersona({ priorityDomains: ['money_wealth'], situation: 'employee' }),
        programs,
      )?.id,
    ).toBe('PR4');
    expect(
      selectProgram(
        assignPersona({ priorityDomains: ['clarity_goals'], situation: 'employee' }),
        programs,
      )?.id,
    ).toBe('PR2');
    expect(
      selectProgram(
        assignPersona({ priorityDomains: ['clarity_goals'], situation: 'student' }),
        programs,
      )?.id,
    ).toBe('PR3');
    expect(
      selectProgram(
        assignPersona({ priorityDomains: ['clarity_goals'], situation: null }),
        programs,
      )?.id,
    ).toBe('PR1');
  });

  it('only a published program is selected', () => {
    expect(
      selectProgram('employee', [{ id: 'PR2', persona: 'employee', status: 'draft' }]),
    ).toBeNull();
  });
});
