// Publishes an EAS Update (OTA) of the app.
//
//   pnpm deploy:mobile                       # preview channel, message = last commit subject
//   pnpm deploy:mobile "what changed"        # custom message
//   pnpm deploy:mobile --production "msg"    # production channel
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const production = args.includes('--production');
const env = production ? 'production' : 'preview';
const message =
  args.filter((a) => !a.startsWith('--')).join(' ').trim() ||
  spawnSync('git', ['log', '-1', '--pretty=%s'], { encoding: 'utf8' }).stdout.trim() ||
  'Update';

console.log(`→ EAS Update · ${env} · "${message}"`);
const r = spawnSync('pnpm', ['exec', 'eas', 'update', '--branch', env, '--environment', env, '--non-interactive', '--message', message], { stdio: 'inherit' });
process.exit(r.status ?? 1);
