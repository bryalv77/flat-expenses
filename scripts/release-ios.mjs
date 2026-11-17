// Local iOS build + TestFlight upload, no EAS.
//   pnpm release:ios               # bump patch, build, upload
//   pnpm release:ios --no-upload   # stop after the IPA
// Env: ASC_KEY_ID, ASC_ISSUER_ID, APPLE_TEAM_ID (optional: RBENV_VERSION for cocoapods)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const run = (cmd, args, opts = {}) => {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
};

const upload = !process.argv.includes('--no-upload');
const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuerId, APPLE_TEAM_ID: teamId } = process.env;
const missing = ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'APPLE_TEAM_ID'].filter((k) => !process.env[k]);
if (missing.length) fail(`Missing env var(s): ${missing.join(', ')}`);
const keyPath = join(homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${keyId}.p8`);
if (!existsSync(keyPath)) fail(`API key not found at ${keyPath}`);

const appJsonText = readFileSync('app.json', 'utf8');
const appJson = JSON.parse(appJsonText);
const bundleId = appJson.expo?.ios?.bundleIdentifier;
if (!bundleId) fail('expo.ios.bundleIdentifier missing in app.json');
const parts = String(appJson.expo.version).split('.');
if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
  throw new Error(`expo.version must be MAJOR.MINOR.PATCH, got "${appJson.expo.version}"`);
}
parts[2] = String(Number(parts[2]) + 1);
const version = parts.join('.');
const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const buildNumber = `${p2(d.getFullYear() % 100)}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}`;

const writeApp = (withBuild) => {
  const j = structuredClone(appJson);
  j.expo.version = version;
  if (withBuild) j.expo.ios.buildNumber = buildNumber;
  writeFileSync('app.json', JSON.stringify(j, null, 2) + '\n');
};

const auth = [
  '-allowProvisioningUpdates',
  '-authenticationKeyPath', keyPath,
  '-authenticationKeyID', keyId,
  '-authenticationKeyIssuerID', issuerId,
];

let ok = false;
try {
  console.log(`→ ${bundleId} ${version} (${buildNumber})`);
  writeApp(true);
  run('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'ios', '--clean', '--no-install']);
  run('pod', ['install'], { cwd: 'ios' });

  const app = readdirSync('ios').find((f) => f.endsWith('.xcworkspace'))?.replace(/\.xcworkspace$/, '');
  if (!app) throw new Error('No .xcworkspace found in ios/ after prebuild');
  mkdirSync('build', { recursive: true });
  const archive = `build/${app}.xcarchive`;
  run('xcodebuild', [
    '-workspace', `ios/${app}.xcworkspace`, '-scheme', app, '-configuration', 'Release',
    '-destination', 'generic/platform=iOS', '-archivePath', archive,
    ...auth, `DEVELOPMENT_TEAM=${teamId}`, 'archive',
  ]);

  const plist = 'build/ExportOptions.plist';
  writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>teamID</key><string>${teamId}</string>
<key>signingStyle</key><string>automatic</string>
<key>destination</key><string>export</string>
</dict></plist>
`);
  const exportDir = 'build/export';
  run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportPath', exportDir, '-exportOptionsPlist', plist, ...auth]);

  const exported = readdirSync(exportDir).find((f) => f.endsWith('.ipa'));
  if (!exported) throw new Error(`No .ipa produced in ${exportDir}`);
  const ipa = `build/${app}-${version}.ipa`;
  run('mv', [join(exportDir, exported), ipa]);

  if (upload) {
    run('xcrun', ['altool', '--upload-app', '--type', 'ios', '--file', ipa, '--apiKey', keyId, '--apiIssuer', issuerId]);
  }
  ok = true;
  console.log(`\n✓ ${upload ? 'Uploaded' : 'Built (not uploaded)'} ${ipa} — version ${version}, build ${buildNumber}`);
} catch (e) {
  console.error(`\n✗ ${e.message}`);
} finally {
  // Persist only the version bump (on success); the build number never lands in app.json.
  if (ok) writeApp(false);
  else writeFileSync('app.json', appJsonText);
}
process.exit(ok ? 0 : 1);
