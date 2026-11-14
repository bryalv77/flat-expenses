// Test-only in-memory stand-in for the parts of expo-file-system's File/Directory/Paths API the local store uses.
const files = new Map<string, Uint8Array>();
const dirs = new Set<string>();

const uriOf = (p: string | { uri: string }) => (typeof p === 'string' ? p : p.uri);
const join = (parts: (string | { uri: string })[]) =>
  parts.map(uriOf).join('/').replace(/(?<![:/])\/{2,}/g, '/').replace(/\/$/, '');
const parentOf = (uri: string) => uri.slice(0, uri.lastIndexOf('/'));

export class Directory {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists() {
    return dirs.has(this.uri) || [...files.keys()].some((k) => k.startsWith(this.uri + '/'));
  }
  create(opts: { intermediates?: boolean; idempotent?: boolean } = {}) {
    if (dirs.has(this.uri) && !opts.idempotent) throw new Error('already exists');
    if (opts.intermediates) for (let d = this.uri; d.length > 'file:///'.length; d = parentOf(d)) dirs.add(d);
    dirs.add(this.uri);
  }
  delete() {
    if (!this.exists) throw new Error('does not exist');
    [...files.keys()].filter((k) => k.startsWith(this.uri + '/')).forEach((k) => files.delete(k));
    [...dirs].filter((d) => d === this.uri || d.startsWith(this.uri + '/')).forEach((d) => dirs.delete(d));
  }
}

export class File {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists() {
    return files.has(this.uri);
  }
  get parentDirectory() {
    return new Directory(parentOf(this.uri));
  }
  write(bytes: Uint8Array) {
    if (!dirs.has(parentOf(this.uri))) throw new Error('parent directory does not exist');
    files.set(this.uri, bytes);
  }
  async bytes() {
    const b = files.get(this.uri);
    if (!b) throw new Error('does not exist');
    return b;
  }
  delete() {
    if (!files.delete(this.uri)) throw new Error('does not exist');
  }
}

export const Paths = { document: new Directory('file:///doc') };

export const fakeExpoFs = { File, Directory, Paths };
export const resetFakeFs = () => {
  files.clear();
  dirs.clear();
  dirs.add('file:///doc');
};
