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
    // Disappearing and feeling useless (lot 9 corrections, eval n° 22)
    'I feel like disappearing, nobody would even notice',
    'Sometimes I want to disappear',
    'Everyone would be better off without me',
    'No one would miss me',
    "I don't want to be here anymore",
    "I'm a burden to everyone",
    "J'ai envie de disparaître",
    'Personne ne remarquerait si je partais',
    'Tout le monde serait mieux sans moi',
    'Je voudrais ne plus être là',
    'Je ne sers à rien',
    'Je suis un poids pour ma famille',
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
    'Je veux faire disparaître mes doutes',
    'La procrastination va disparaître avec ce programme',
    'Nobody noticed my new routine yet',
    'I want this bad habit to disappear',
    'My stress disappeared after the walk',
    'Est-ce que mon objectif sert à quelque chose ?',
  ])('does not fire on "%s"', (text) => {
    expect(detectDistress(text)).toBe(false);
  });
});
