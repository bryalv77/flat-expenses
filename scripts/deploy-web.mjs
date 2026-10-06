// Builds the web app and deploys it to Firebase: Hosting + Firestore rules + Storage rules.
// Aborts before deploying if the exported inline script no longer matches the CSP hash in firebase.json
// (that mismatch would blank the site in production).
//
//   pnpm deploy:web
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const run = (cmd, args) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('pnpm', ['exec', 'expo', 'export', '--platform', 'web']);

const html = readFileSync('dist/index.html', 'utf8');
const csp = readFileSync('firebase.json', 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const missing = inline.map((s) => `sha256-${createHash('sha256').update(s).digest('base64')}`).filter((h) => !csp.includes(h));
if (missing.length) {
  console.error(`\n✖ CSP hash mismatch. Add to script-src in firebase.json: ${missing.map((h) => `'${h}'`).join(' ')}`);
  process.exit(1);
}
console.log('\n✔ CSP hashes match firebase.json');

run('pnpm', ['exec', 'firebase', 'deploy', '--only', 'hosting,firestore:rules,storage']);
