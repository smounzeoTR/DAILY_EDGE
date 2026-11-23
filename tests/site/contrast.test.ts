// WCAG 2.1 AA contrast of the site's design tokens, in both themes.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../site/src/styles/tokens.css', import.meta.url), 'utf8');

function block(source: string, start: number): string {
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error('Unbalanced CSS block');
}

function colours(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1]!] = m[2]!.toLowerCase();
  }
  return out;
}

const light = colours(block(css, css.indexOf(':root')));
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const dark = { ...light, ...colours(block(block(css, darkStart), 0)) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum ratio]: 4.5 for text, 3 for UI components (1.4.11)
const pairs: [string, string, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-long', 'bg', 4.5],
  ['text-long', 'surface', 4.5],
  ['link', 'bg', 4.5],
  ['link', 'surface', 4.5],
  ['danger', 'bg', 4.5],
  ['danger', 'surface', 4.5],
  ['button-text', 'button-bg', 4.5],
  ['button-text', 'button-bg-hover', 4.5],
  ['field-border', 'surface', 3],
  ['field-border', 'bg', 3],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
  ['button-bg', 'bg', 3],
];

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('site tokens, %s theme', (_name, theme) => {
  it.each(pairs)('%s on %s ≥ %d:1', (fg, bg, min) => {
    expect(theme[fg], `missing --color-${fg}`).toBeDefined();
    expect(theme[bg], `missing --color-${bg}`).toBeDefined();
    expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(min);
  });
});

it('keeps the identity colours exactly', () => {
  expect(light).toMatchObject({
    bg: '#f3f5fb',
    surface: '#ffffff',
    primary: '#2f5bff',
    accent: '#ff5a1f',
    text: '#0b1b3f',
    'text-muted': '#4a5578',
  });
  expect(dark).toMatchObject({
    bg: '#0a1230',
    surface: '#131c40',
    border: '#26315c',
    primary: '#5b7cff',
    link: '#8fa6ff',
    text: '#f3f5fb',
    'text-muted': '#a9b3d1',
  });
});
