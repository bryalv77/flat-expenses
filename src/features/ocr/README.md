# OCR / automatic bill extraction (planned — NOT implemented)

Bills already carry the extension points:

- `Bill.ocrStatus` (`NONE | PENDING | DONE | FAILED`, default `NONE`) and `Bill.ocrData` (JSON).
- `TODO(ocr)` marker in `src/features/bills/hooks.ts` → `useCreateBill`, right after the file upload.

## Planned pipeline

1. **Trigger** — a Worker queue/handler after a bill file is uploaded.
2. **Mark** — set `ocrStatus = PENDING` in Postgres.
3. **Extract** — Document AI / an LLM with vision reads the PDF or photo and returns
   `{ amountCents, chargeDate, periodStartDate, periodEndDate, supplier, categoryGuess, confidence }`.
4. **Store** — write the raw result to `ocrData`, set `ocrStatus = DONE` (or `FAILED` with the error).
5. **Confirm** — the bill screen shows suggested category / amount / dates; the admin accepts or edits.
   Suggestions never overwrite admin-entered values silently.

## Notes
- Needs a background job on the Worker (queue or cron).
- Keep extraction idempotent: re-running must only touch `ocrStatus` / `ocrData`.
