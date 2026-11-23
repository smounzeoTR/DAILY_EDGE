// Share image 1200 × 630 (§ 9), generated at build time with the brand fonts and colours.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import type { APIRoute } from 'astro';

import { woffToSfnt } from '../og/woff';

const require = createRequire(import.meta.url);
// resvg 2.6 ignores fontBuffers: the converted fonts go through temporary files
function fontFile(dir: string, path: string): string {
  const file = join(dir, `${path.split('/').pop()}.ttf`);
  writeFileSync(file, woffToSfnt(readFileSync(require.resolve(path))));
  return file;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const GET: APIRoute = () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#F3F5FB"/>
  <g transform="translate(96 88) scale(1.5)">
    <path d="M14 40 A18 18 0 0 1 50 40 Z" fill="#FF5A1F"/>
    <g stroke="#2F5BFF" stroke-width="4" stroke-linecap="round">
      <line x1="6" y1="40" x2="58" y2="40"/>
      <line x1="16" y1="48" x2="48" y2="48" opacity="0.55"/>
      <line x1="25" y1="56" x2="39" y2="56" opacity="0.3"/>
    </g>
  </g>
  <text x="200" y="160" font-family="Space Grotesk" font-weight="700" font-size="56" fill="#0B1B3F">daily<tspan fill="#2F5BFF">edge</tspan></text>
  <text font-family="Space Grotesk" font-weight="700" font-size="76" fill="#0B1B3F" letter-spacing="-1.5">
    <tspan x="96" y="330">${escape('Tu as lu les livres.')}</tspan>
    <tspan x="96" y="420">${escape('Maintenant, applique-les.')}</tspan>
  </text>
  <text x="96" y="510" font-family="Inter" font-size="34" fill="#4A5578">${escape('Un principe, un exercice, trois habitudes. 10 minutes par jour.')}</text>
  <rect x="96" y="560" width="120" height="8" rx="4" fill="#FF5A1F"/>
</svg>`;
  const dir = mkdtempSync(join(tmpdir(), 'dailyedge-og-'));
  try {
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      font: {
        loadSystemFonts: false,
        fontFiles: [
          fontFile(dir, '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff'),
          fontFile(dir, '@fontsource/inter/files/inter-latin-400-normal.woff'),
        ],
        defaultFontFamily: 'Inter',
      },
    })
      .render()
      .asPng();
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
