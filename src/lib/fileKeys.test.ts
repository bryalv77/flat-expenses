import { FILE_RULES, parseFileKey, sanitizeFileName, storagePaths } from './fileKeys';

describe('fileKeys', () => {
  it('every key the builders produce parses back to its kind and owner', () => {
    expect(parseFileKey(storagePaths.avatar('u1', 'Mi foto.PNG'))).toEqual({ kind: 'avatar', owner: 'u1' });
    expect(parseFileKey(storagePaths.userDocument('u1', 'd1', 'dni.pdf'))).toEqual({ kind: 'document', owner: 'u1' });
    expect(parseFileKey(storagePaths.bill('h1', 'b1', 'factura é.jpg'))).toEqual({ kind: 'bill', owner: 'h1' });
  });

  it('rejects keys outside the layout and path tricks', () => {
    for (const key of ['', 'users/u1/avatar', 'users/u1/other/x.png', 'houses/h1/bills/b1/../x', 'users/../avatar/x', 'a/b']) {
      expect(parseFileKey(key)).toBeNull();
    }
  });

  it('sanitizes names into a safe segment', () => {
    expect(sanitizeFileName('../Mi foto (1).PNG')).toBe('Mi_foto_1.png');
    expect(sanitizeFileName('???')).toBe('file');
  });

  it('only avatars are image-only and smaller', () => {
    expect(FILE_RULES.avatar.mimeTypes).not.toContain('application/pdf');
    expect(FILE_RULES.bill.mimeTypes).toContain('application/pdf');
    expect(FILE_RULES.avatar.maxBytes).toBeLessThan(FILE_RULES.bill.maxBytes);
  });
});
