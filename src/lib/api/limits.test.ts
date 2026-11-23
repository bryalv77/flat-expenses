import { MAX_AMOUNT_CENTS, MAX_BILL_FILES, MAX_CONFIG_CENTS, MAX_FILE_BYTES, newGuestId } from '../limits';
import { zAmountCents, zBillCreate, zBillFileRef, zCents, zGuestId } from './generated/zod.gen';

// limits.ts feeds SQL checks and the UI, which cannot read openapi.yaml: these tests keep it equal to the contract.
describe('limits.ts matches openapi.yaml', () => {
  it('amounts', () => {
    expect(zAmountCents.safeParse(MAX_AMOUNT_CENTS).success).toBe(true);
    expect(zAmountCents.safeParse(MAX_AMOUNT_CENTS + 1).success).toBe(false);
    expect(zCents.safeParse(MAX_CONFIG_CENTS).success).toBe(true);
    expect(zCents.safeParse(MAX_CONFIG_CENTS + 1).success).toBe(false);
  });

  it('files per bill and bytes per file', () => {
    const ref = { objectKey: 'k', fileName: 'f', mimeType: 'image/png', sizeBytes: 1 };
    const bill = (n: number) => ({ categoryId: crypto.randomUUID(), amountCents: 1, files: Array.from({ length: n }, () => ref) });
    expect(zBillCreate.safeParse(bill(MAX_BILL_FILES)).success).toBe(true);
    expect(zBillCreate.safeParse(bill(MAX_BILL_FILES + 1)).success).toBe(false);
    expect(zBillFileRef.safeParse({ ...ref, sizeBytes: MAX_FILE_BYTES }).success).toBe(true);
    expect(zBillFileRef.safeParse({ ...ref, sizeBytes: MAX_FILE_BYTES + 1 }).success).toBe(false);
  });

  it('generated guest ids are valid', () => {
    expect(zGuestId.safeParse(newGuestId(crypto.randomUUID())).success).toBe(true);
  });
});
