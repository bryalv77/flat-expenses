import type { FileStore } from './fileStore';

export interface ContractHarness {
  store: FileStore;
  /** Bytes behind a URL returned by `store.getUrl`, or undefined when the file is gone. */
  read(path: string): Promise<Uint8Array | undefined>;
}

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const sources = new Map<string, Uint8Array>();

/** Fake `fetch` so `upload` can read picked-file URIs in Node. */
export function installFetch() {
  (global as { fetch: unknown }).fetch = async (uri: string) => ({
    blob: async () => new Blob([sources.get(uri) ?? PNG]),
  });
}

export const pick = (name: string, bytes = PNG) => {
  const uri = `file:///picked/${name}`;
  sources.set(uri, bytes);
  return { uri, name, mimeType: 'image/png', size: bytes.length };
};

export function runFileStoreContract(make: () => Promise<ContractHarness> | ContractHarness) {
  let h: ContractHarness;
  beforeEach(async () => {
    installFetch();
    h = await make();
  });

  it('uploads and reads back the same bytes', async () => {
    const res = await h.store.upload('houses/h1/bills/b1/a.png', pick('a.png'));
    expect(res).toEqual({
      storagePath: 'houses/h1/bills/b1/a.png',
      fileName: 'a.png',
      mimeType: 'image/png',
      sizeBytes: PNG.length,
    });
    expect([...(await h.read('houses/h1/bills/b1/a.png'))!]).toEqual([...PNG]);
  });

  it('overwrites an existing key', async () => {
    await h.store.upload('users/u/avatar/a.png', pick('a.png'));
    await h.store.upload('users/u/avatar/a.png', pick('b.png', new Uint8Array([9])));
    expect([...(await h.read('users/u/avatar/a.png'))!]).toEqual([9]);
  });

  it('delete removes the file and is idempotent', async () => {
    await h.store.upload('houses/h1/bills/b1/a.png', pick('a.png'));
    await h.store.delete('houses/h1/bills/b1/a.png');
    expect(await h.read('houses/h1/bills/b1/a.png')).toBeUndefined();
    await expect(h.store.delete('houses/h1/bills/b1/a.png')).resolves.toBeUndefined();
    await expect(h.store.delete('never/existed.png')).resolves.toBeUndefined();
  });

  it('deleteFolder removes the prefix only', async () => {
    await h.store.upload('houses/h1/bills/b1/a.png', pick('a.png'));
    await h.store.upload('houses/h1/bills/b2/b.png', pick('b.png'));
    await h.store.upload('houses/h10/bills/b1/c.png', pick('c.png'));
    await h.store.deleteFolder('houses/h1');
    expect(await h.read('houses/h1/bills/b1/a.png')).toBeUndefined();
    expect(await h.read('houses/h1/bills/b2/b.png')).toBeUndefined();
    expect(await h.read('houses/h10/bills/b1/c.png')).toBeDefined();
    await expect(h.store.deleteFolder('houses/h1')).resolves.toBeUndefined();
  });

  it('rejects path traversal and absolute keys', async () => {
    for (const bad of ['../x.png', 'a/../../x.png', '/etc/x.png', 'a//b.png', 'a\\b.png', '']) {
      await expect(h.store.upload(bad, pick('a.png'))).rejects.toThrow(/invalid file key/i);
      await expect(h.store.getUrl(bad)).rejects.toThrow(/invalid file key/i);
      await expect(h.store.delete(bad)).rejects.toThrow(/invalid file key/i);
      await expect(h.store.deleteFolder(bad)).rejects.toThrow(/invalid file key/i);
    }
  });

  it('rejects unsupported types', async () => {
    await expect(
      h.store.upload('houses/h1/bills/b1/a.exe', { ...pick('a.exe'), mimeType: 'application/x-msdownload' }),
    ).rejects.toThrow(/unsupported/i);
  });
}
