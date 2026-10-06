#!/usr/bin/env python3
"""Downloads the Google Drive receipts referenced by extract-excel.py's JSON and serves them (with CORS) so the
in-app importer (app/(app)/import.tsx, dev only) can read data + files from http://localhost:8765.

  python3 scripts/prepare-import-bundle.py data.json bundle-dir            # download + write bundle-dir/data.json
  python3 scripts/prepare-import-bundle.py --serve bundle-dir [port]       # serve it (default 8765)
"""
import concurrent.futures as cf, http.server, json, os, re, sys, urllib.request

MAX = 10 * 1024 * 1024
EXT = {'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png'}

def sniff(b):
    if b[:5] == b'%PDF-': return 'application/pdf'
    if b[:2] == b'\xff\xd8': return 'image/jpeg'
    if b[1:4] == b'PNG': return 'image/png'
    return None

def fetch(link):
    m = re.search(r'/d/([^/]+)', link or '')
    if not m: return None
    try:
        req = urllib.request.Request(f'https://drive.google.com/uc?export=download&id={m.group(1)}', headers={'User-Agent': 'Mozilla/5.0'})
        b = urllib.request.urlopen(req, timeout=30).read()
        mime = sniff(b)
        return (b, mime) if mime and len(b) <= MAX else None
    except Exception:
        return None

def prepare(src, out):
    os.makedirs(os.path.join(out, 'files'), exist_ok=True)
    data = json.load(open(src))
    jobs = []
    for s in data:
        for b in s['bills']:
            b['id'] = f"xl-{s['month']}-r{b['row']}"
            b['file'] = None
            if b['amount'] > 0 and b['link']: jobs.append(b)
    def work(b):
        r = fetch(b['link'])
        if not r: return b, None
        body, mime = r
        rel = f"files/{b['id']}.{EXT[mime]}"
        open(os.path.join(out, rel), 'wb').write(body)
        label = re.sub(r'\.(pdf|jpe?g|png)$', '', b['fileLabel'] or b['id'], flags=re.I)
        return b, {'path': rel, 'name': f'{label}.{EXT[mime]}', 'mime': mime, 'size': len(body)}
    failed = []
    with cf.ThreadPoolExecutor(8) as ex:
        for b, f in ex.map(work, jobs):
            b['file'] = f
            if not f: failed.append(f"{b['id']} {b['label']}: {b['fileLabel']}")
    json.dump(data, open(os.path.join(out, 'data.json'), 'w'), ensure_ascii=False)
    print(f'{len(jobs) - len(failed)}/{len(jobs)} receipts downloaded; {len(failed)} unreachable:')
    print('\n'.join('  ' + f for f in failed))

class CORS(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

if __name__ == '__main__':
    if sys.argv[1] == '--serve':
        os.chdir(sys.argv[2])
        port = int(sys.argv[3]) if len(sys.argv) > 3 else 8765
        print(f'serving {sys.argv[2]} on http://localhost:{port}')
        http.server.ThreadingHTTPServer(('127.0.0.1', port), CORS).serve_forever()
    else:
        prepare(sys.argv[1], sys.argv[2])
