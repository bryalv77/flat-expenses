// Static server for the exported web build (dev server can't bundle expo-sqlite's web worker). SPA fallback.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const [root, port] = [process.argv[2], Number(process.argv[3])];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };

async function find(path) {
  for (const p of [path, `${path}.html`, join(path, 'index.html')]) {
    try { if ((await stat(p)).isFile()) return p; } catch { /* next */ }
  }
}

createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = (await find(join(root, rel))) ?? join(root, 'index.html');
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'credentialless',
  });
  res.end(await readFile(file));
}).listen(port, () => console.log(`serving ${root} on ${port}`));
