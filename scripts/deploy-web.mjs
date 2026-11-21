// Builds the static web app and deploys it as a Cloudflare Worker with static assets (root wrangler.jsonc, name `costos-piso`).
// Not `wrangler pages deploy`: Pages projects are not created in this account, and the landing already ships this way.
// Headers/CSP live in public/_headers (Expo copies public/ into dist/). Aborts before deploying if the exported inline script
// no longer matches the CSP hash there (that mismatch would blank the site in production).
//
//   pnpm deploy:web
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Inlined at bundle time and overriding .env (which holds Firebase and emulator settings): a deploy must never ship a build pointing anywhere else.
const PROD_ENV = { EXPO_PUBLIC_API_URL: 'https://api-cuota.devalv.com', EXPO_PUBLIC_WEB_URL: 'https://app-cuota.devalv.com', EXPO_PUBLIC_USE_EMULATORS: 'false', EXPO_PUBLIC_RECAPTCHA_SITE_KEY: '' };

const run = (cmd, args) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...PROD_ENV } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('pnpm', ['exec', 'expo', 'export', '--platform', 'web']);

const html = readFileSync('dist/index.html', 'utf8');
const csp = readFileSync('public/_headers', 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const missing = inline.map((s) => `sha256-${createHash('sha256').update(s).digest('base64')}`).filter((h) => !csp.includes(h));
if (missing.length) {
  console.error(`\n✖ CSP hash mismatch. Add to script-src in public/_headers: ${missing.map((h) => `'${h}'`).join(' ')}`);
  process.exit(1);
}
console.log('\n✔ CSP hashes match public/_headers');

run('pnpm', ['exec', 'wrangler', 'deploy']);
