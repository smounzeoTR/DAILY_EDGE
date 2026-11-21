import { describe, expect, it } from 'vitest';

import { detectDistress } from '../distress.ts';

describe('distress safety net', () => {
  it.each([
    'Je pense au suicide ces temps-ci',
    "J'ai envie d'en finir",
    'Je n’ai plus envie de vivre',
    'je veux mourir',
    'Parfois je me fais du mal',
    "J'ai envie de disparaître",
    'I want to kill myself',
    'I want to die',
    'thinking about self-harm',
    'There is no reason to live',
  ])('fires on "%s"', (text) => {
    expect(detectDistress(text)).toBe(true);
  });

  it.each([
    'Je meurs de faim, on parle de mon plan ?',
    'Il faut que je tue le temps avant ma réunion',
    'Je veux finir mon exercice',
    'Comment en finir avec la procrastination ?',
    'This deadline is killing me',
    'I am dying to start the program',
  ])('does not fire on "%s"', (text) => {
    expect(detectDistress(text)).toBe(false);
  });
});
