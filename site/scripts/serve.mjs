// Static server for the tests (Playwright, Lighthouse): serves dist/ like Cloudflare Pages does,
// with _headers (path rules, "! Header" detach), _redirects, extension-less pages and 404.html.
// Usage: node scripts/serve.mjs [port]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const port = Number(process.argv[2] || 4329);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

function parseHeaders() {
  const rules = [];
  const file = join(dist, '_headers');
  if (!existsSync(file)) return rules;
  let current = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      current = { pattern: line.trim(), set: [], detach: [] };
      rules.push(current);
    } else if (line.trim().startsWith('!')) {
      current.detach.push(line.trim().slice(1).trim().toLowerCase());
    } else {
      const i = line.indexOf(':');
      current.set.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

function matches(pattern, host, path) {
  let rule = pattern;
  if (/^https?:\/\//.test(rule)) {
    const url = new URL(rule.replace(/:project/g, 'PROJECT').replace('*', 'STAR'));
    const hostPattern = new RegExp(
      `^${url.host.replace(/\./g, '\\.').replace('PROJECT', '[^.]+')}$`,
    );
    if (!hostPattern.test(host)) return false;
    rule = url.pathname.replace('STAR', '*');
  }
  const re = new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return re.test(path);
}

function parseRedirects() {
  const file = join(dist, '_redirects');
  if (!existsSync(file)) return new Map();
  return new Map(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => l.trim().split(/\s+/))
      .map(([from, to, status]) => [from, { to, status: Number(status || 302) }]),
  );
}

const rules = parseHeaders();
const redirects = parseRedirects();

function resolve(path) {
  const clean = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [clean, `${clean}.html`, join(clean, 'index.html')]) {
    const file = join(dist, candidate);
    if (file.startsWith(dist) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const headers = {};
  for (const rule of rules) {
    if (!matches(rule.pattern, url.hostname, url.pathname)) continue;
    for (const name of rule.detach) {
      for (const key of Object.keys(headers)) if (key.toLowerCase() === name) delete headers[key];
    }
    for (const [name, value] of rule.set) {
      headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
    }
  }
  const redirect = redirects.get(url.pathname);
  if (redirect) {
    res.writeHead(redirect.status, { ...headers, Location: redirect.to });
    return res.end();
  }
  const file = resolve(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = file ?? join(dist, '404.html');
  res.writeHead(file ? 200 : 404, {
    ...headers,
    'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream',
  });
  res.end(readFileSync(target));
}).listen(port, () => console.log(`serving dist/ on http://localhost:${port}`));
