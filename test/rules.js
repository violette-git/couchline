// House rules and packaging checks that don't need a server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checker } from './helpers.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = checker();

// No em dashes anywhere in code comments, UI text, or docs. (Third-party copies are skipped.)
const SKIP = new Set(['node_modules', '.git', 'package-lock.json', 'socket.io.min.js']);
const TEXT = /\.(js|css|html|md|json|webmanifest|example)$/;
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (TEXT.test(name) || name === 'Procfile') out.push(p);
  }
  return out;
}
const offenders = walk(root).filter((p) => fs.readFileSync(p, 'utf8').includes(String.fromCharCode(0x2014))).map((p) => path.relative(root, p));
assert.deepEqual(offenders, [], `em dashes found in: ${offenders.join(', ')}`);
check.ok('no em dashes in code, UI text, or docs');

// The extension manifest only points at files that exist, and ships no remote code.
const ext = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
const referenced = [
  ...Object.values(manifest.icons),
  manifest.action.default_popup,
  ...manifest.content_scripts.flatMap((c) => c.js),
];
for (const f of referenced) assert.ok(fs.existsSync(path.join(ext, f)), `missing ${f}`);
const netflixMain = manifest.content_scripts.find((c) => c.world === 'MAIN');
assert.deepEqual(netflixMain.matches, ['https://www.netflix.com/*'], 'only Netflix gets a page-world script');
for (const page of ['sidebar/sidebar.html', 'popup/popup.html']) {
  const html = fs.readFileSync(path.join(ext, page), 'utf8');
  assert.ok(!/<script[^>]+src="https?:/i.test(html), `${page} loads a remote script`);
  for (const [, src] of html.matchAll(/(?:src|href)="(\.\.?\/[^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(ext, path.dirname(page), src)), `${page} points at missing ${src}`);
  }
}
check.ok('extension manifest and pages point at real, packaged files');

// The extension's content script never sets currentTime on Netflix (error M7375).
const bridge = fs.readFileSync(path.join(ext, 'content', 'bridge.js'), 'utf8');
const seekLine = bridge.split('\n').find((l) => l.includes('currentTime =') || l.includes('currentTime='));
assert.ok(seekLine?.includes("SERVICE === 'Netflix'") || seekLine?.includes('else if (video)'), 'currentTime is only set in the Hulu branch');
assert.equal(bridge.split('currentTime =').length - 1, 1, 'exactly one place sets currentTime');
check.ok('the content script only sets currentTime on Hulu');

console.log(`\n${check.count} rule checks passed\n`);
