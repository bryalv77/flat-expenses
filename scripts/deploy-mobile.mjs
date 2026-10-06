// Publishes an EAS Update (OTA) of the app.
//
//   pnpm deploy:mobile                       # preview channel, message = last commit subject
//   pnpm deploy:mobile "what changed"        # custom message
//   pnpm deploy:mobile --production "msg"    # production channel
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const production = args.includes('--production');
const env = production ? 'production' : 'preview';
const message =
  args.filter((a) => !a.startsWith('--')).join(' ').trim() ||
  spawnSync('git', ['log', '-1', '--pretty=%s'], { encoding: 'utf8' }).stdout.trim() ||
  'Update';

// `eas update --environment` ignores the local .env, so hand the public app config (EXPO_PUBLIC_* only, never secrets) to the export.
let publicEnv = {};
try {
  publicEnv = Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .map((l) => l.match(/^(EXPO_PUBLIC_[A-Z0-9_]+)=(.*)$/))
      .filter((m) => m && m[2] !== '')
      .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]),
  );
} catch { /* no .env: the app falls back to its built-in defaults */ }

console.log(`→ EAS Update · ${env} · "${message}"`);
const r = spawnSync('pnpm', ['exec', 'eas', 'update', '--branch', env, '--environment', env, '--non-interactive', '--message', message], { stdio: 'inherit', env: { ...process.env, ...publicEnv } });
process.exit(r.status ?? 1);
