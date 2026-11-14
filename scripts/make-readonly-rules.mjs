// Derives READ-ONLY Firestore and Storage rules from firestore.rules / storage.rules for the cutover freeze (docs/cutover-plan.md):
// every `allow` keeps its read methods (read, get, list) with the same condition and loses create / update / delete / write.
// Derived rather than hand-written so the frozen rules cannot drift from the real ones.
//
//   pnpm rules:readonly                    writes .readonly/firestore.rules, .readonly/storage.rules and firebase.readonly.json
//   pnpm exec firebase deploy --only firestore:rules,storage --config firebase.readonly.json     freezes Firebase
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const READ = new Set(['read', 'get', 'list']);

/**
 * Rewrites every `allow <methods>: if <condition>;`. A regex is not enough: conditions contain `//` comments (with semicolons in
 * them) and string literals, so the end of a statement is found by scanning and skipping those.
 */
export function toReadOnly(rules) {
  const header = /^allow\s+([a-z][a-z,\s]*?)\s*:\s*if\b/;
  let out = '';
  let i = 0;
  while (i < rules.length) {
    if (rules.startsWith('//', i)) { // comments are copied as they are
      const eol = rules.indexOf('\n', i);
      const end = eol === -1 ? rules.length : eol;
      out += rules.slice(i, end);
      i = end;
      continue;
    }
    if (rules.startsWith('/*', i)) {
      const close = rules.indexOf('*/', i + 2);
      const end = close === -1 ? rules.length : close + 2;
      out += rules.slice(i, end);
      i = end;
      continue;
    }
    const m = !/[\w$]/.test(rules[i - 1] ?? ' ') ? header.exec(rules.slice(i, i + 200)) : null;
    if (!m) {
      out += rules[i++];
      continue;
    }
    let j = i + m[0].length; // scan the condition up to the first `;` that is not inside a comment or a string
    while (j < rules.length && rules[j] !== ';') {
      if (rules.startsWith('//', j)) j = rules.indexOf('\n', j) === -1 ? rules.length : rules.indexOf('\n', j);
      else if (rules.startsWith('/*', j)) j = rules.indexOf('*/', j + 2) === -1 ? rules.length : rules.indexOf('*/', j + 2) + 2;
      else if (rules[j] === "'" || rules[j] === '"') {
        const q = rules[j++];
        while (j < rules.length && rules[j] !== q) j += rules[j] === '\\' ? 2 : 1;
        j++;
      } else j++;
    }
    const keep = m[1].split(',').map((x) => x.trim()).filter((x) => READ.has(x));
    out += keep.length ? `allow ${keep.join(', ')}: if${rules.slice(i + m[0].length, j)};` : '// write access removed for the cutover freeze';
    i = j + 1;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync('.readonly', { recursive: true });
  for (const f of ['firestore.rules', 'storage.rules']) {
    const out = toReadOnly(readFileSync(f, 'utf8'));
    const writes = out.match(/allow\s+[^:]*\b(create|update|delete|write)\b/g);
    if (writes) throw new Error(`${f}: a write rule survived: ${writes[0]}`);
    writeFileSync(`.readonly/${f}`, out);
  }
  writeFileSync('firebase.readonly.json', JSON.stringify({ firestore: { database: '(default)', rules: '.readonly/firestore.rules' }, storage: { rules: '.readonly/storage.rules' } }, null, 2) + '\n');
  console.log('wrote .readonly/firestore.rules, .readonly/storage.rules and firebase.readonly.json');
}
