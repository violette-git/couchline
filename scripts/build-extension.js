// Copies the web app files the extension reuses into extension/, because a Manifest V3
// extension can only run code that ships inside it.
//   node scripts/build-extension.js          copy the files
//   node scripts/build-extension.js --check  exit 1 if any copy is out of date (used by npm test)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const notice = (from, css) => (css
  ? `/* Copied from ${from} by scripts/build-extension.js. Edit the original, then run npm run build:ext. */\n`
  : `// Copied from ${from} by scripts/build-extension.js. Edit the original, then run npm run build:ext.\n`);

const FILES = [
  { from: 'public/call.js', to: 'extension/lib/call.js', header: notice('public/call.js') },
  { from: 'public/sync.js', to: 'extension/lib/sync.js', header: notice('public/sync.js') },
  { from: 'public/styles.css', to: 'extension/lib/styles.css', header: notice('public/styles.css', true) },
  { from: 'node_modules/socket.io/client-dist/socket.io.min.js', to: 'extension/lib/socket.io.min.js' },
  { from: 'public/icon-192.png', to: 'extension/icons/icon-192.png' },
];

function expected(f) {
  const body = fs.readFileSync(path.join(root, f.from));
  return f.header ? Buffer.concat([Buffer.from(f.header), body]) : body;
}

// Git on Windows may check text files out with CRLF line endings, so text compares ignore them.
const lf = (buf) => buf.toString().replace(/\r\n/g, '\n');
const same = (a, b, binary) => (binary ? a.equals(b) : lf(a) === lf(b));

export function staleFiles() {
  return FILES.filter((f) => {
    const target = path.join(root, f.to);
    return !fs.existsSync(target) || !same(fs.readFileSync(target), expected(f), f.to.endsWith('.png'));
  }).map((f) => f.to);
}

export function build() {
  for (const f of FILES) {
    const target = path.join(root, f.to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, expected(f));
  }
  return FILES.map((f) => f.to);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const stale = staleFiles();
    if (stale.length) {
      console.error(`Out of date: ${stale.join(', ')}. Run npm run build:ext.`);
      process.exit(1);
    }
    console.log('Extension copies are up to date.');
  } else {
    for (const f of build()) console.log('wrote', f);
  }
}
