// App icons from the identity symbol (docs/identite-visuelle.md): rising sun on the horizon,
// followed by two shorter, fainter lines. Run: node scripts/app-icon/generate.mjs
// Writes app/assets/images/*.png (iOS light/dark/tinted, Android adaptive layers, web favicon).
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// resvg is already a dependency of the site (share image)
const { Resvg } = createRequire(join(root, 'site', 'package.json'))('@resvg/resvg-js');
const out = join(root, 'app', 'assets', 'images');

const BLUE = '#2F5BFF';
const ORANGE = '#FF5A1F';

/** The symbol (viewBox 0 0 64 64, bbox centred on y = 40), centred and scaled on a 64 grid. */
function symbol({ scale, sun, lines }) {
  return `<g transform="translate(32 32) scale(${scale}) translate(-32 -39)">
    <path d="M14 40 A18 18 0 0 1 50 40 Z" fill="${sun}"/>
    <g stroke="${lines}" stroke-width="4" stroke-linecap="round">
      <line x1="6" y1="40" x2="58" y2="40"/>
      <line x1="16" y1="48" x2="48" y2="48" opacity="0.55"/>
      <line x1="25" y1="56" x2="39" y2="56" opacity="0.3"/>
    </g>
  </g>`;
}

function svg(content, background) {
  const bg = background ? `<rect width="64" height="64" fill="${background}"/>` : '';
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${bg}${content}</svg>`;
}

function write(name, markup, size) {
  const png = new Resvg(markup, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(out, name), png);
  console.log(`${name} (${size} px)`);
}

// iOS: full bleed and opaque (the system applies the mask)
write('icon.png', svg(symbol({ scale: 0.8, sun: ORANGE, lines: '#FFFFFF' }), BLUE), 1024);
// iOS dark appearance (identity: background #131C40, lines #5B7CFF)
write('icon-dark.png', svg(symbol({ scale: 0.8, sun: ORANGE, lines: '#5B7CFF' }), '#131C40'), 1024);
// iOS tinted appearance: grayscale, the system applies the tint
write(
  'icon-tinted.png',
  svg(symbol({ scale: 0.8, sun: '#D9D9D9', lines: '#FFFFFF' }), '#000000'),
  1024,
);
// Android adaptive icon: the foreground stays inside the 66/108 safe zone
write(
  'android-icon-foreground.png',
  svg(symbol({ scale: 0.55, sun: ORANGE, lines: '#FFFFFF' })),
  512,
);
write('android-icon-background.png', svg('', BLUE), 512);
write(
  'android-icon-monochrome.png',
  svg(symbol({ scale: 0.55, sun: '#FFFFFF', lines: '#FFFFFF' })),
  432,
);
// Web favicon (rounded, like site/public/favicon.svg)
write(
  'favicon.png',
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="15" fill="${BLUE}"/>${symbol({ scale: 0.8, sun: ORANGE, lines: '#FFFFFF' })}</svg>`,
  48,
);
