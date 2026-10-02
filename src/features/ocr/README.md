# OCR / automatic bill extraction (planned — NOT implemented)

Bills already carry the extension points:

- `Bill.ocrStatus` (`NONE | PENDING | DONE | FAILED`, default `NONE`) and `Bill.ocrData` (JSON).
- `TODO(ocr)` marker in `src/features/bills/hooks.ts` → `useCreateBill`, right after the file upload.

## Planned pipeline

1. **Trigger** — Cloud Function on Storage `onObjectFinalized` for `houses/{houseId}/bills/{billId}/*`
   (or an explicit callable after the Firestore write).
2. **Mark** — set `ocrStatus = PENDING` through the Firestore Admin SDK.
3. **Extract** — Document AI / an LLM with vision reads the PDF or photo and returns
   `{ amountCents, chargeDate, periodStartDate, periodEndDate, supplier, categoryGuess, confidence }`.
4. **Store** — write the raw result to `ocrData`, set `ocrStatus = DONE` (or `FAILED` with the error).
5. **Confirm** — the bill screen shows suggested category / amount / dates; the admin accepts or edits.
   Suggestions never overwrite admin-entered values silently.

## Notes
- Needs the Blaze plan and Cloud Functions (see README roadmap), and custom claims for tighter Storage rules.
- Keep extraction idempotent: re-running must only touch `ocrStatus` / `ocrData`.
