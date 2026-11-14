// Pure part of the Firebase -> Postgres migration: Firestore / Auth / Storage data in, table rows + a list of issues out.
// No Firebase or database code here, so every rule can be unit-tested (see transform.test.ts). Timestamps arrive as ISO strings.
import { createHash } from 'node:crypto';

import { formatFirebaseHash } from '../../src/firebasePassword.ts';

export interface AuthUserSrc {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoURL?: string;
  passwordHash?: string;
  passwordSalt?: string;
  providers: { providerId: string; uid: string }[];
  createdAt?: string;
}
export interface ProfileSrc { email?: string; displayName?: string; photoPath?: string | null; accountRole?: string; locale?: string; createdAt?: string; updatedAt?: string }
export interface FileRefSrc { storagePath: string; fileName?: string; mimeType?: string; sizeBytes?: number }
export interface DocumentSrc { id: string; type?: string; storagePath?: string; fileName?: string; mimeType?: string; sizeBytes?: number; uploadedAt?: string }
export interface MemberSrc { id: string; role?: string; status?: string; joinedAt?: string; removedAt?: string | null; individualContributionCents?: number | null; displayName?: string; email?: string; photoPath?: string | null; inviteCode?: string | null }
export interface CategorySrc { id: string; name?: string; icon?: string; color?: string; amountType?: string; expectedAmountCents?: number | null; intervalUnit?: string; intervalCount?: number; anchorDate?: string; isActive?: boolean; sortOrder?: number; notes?: string | null; createdAt?: string; updatedAt?: string }
export interface BillSrc {
  id: string; categoryId?: string; amountCents?: number; chargeDate?: string | null; periodStartDate?: string | null; periodEndDate?: string | null; effectiveDate?: string;
  files?: FileRefSrc[]; fileStoragePath?: string | null; fileName?: string | null; fileMimeType?: string | null; fileSizeBytes?: number | null;
  notes?: string | null; ocrStatus?: string; ocrData?: unknown; createdBy?: string; createdAt?: string; updatedAt?: string;
}
export interface PaymentSrc { id: string; memberId?: string; month?: string; amountCents?: number; note?: string | null; paidAt?: string; recordedBy?: string }
export interface HouseSrc {
  id: string; name?: string; address?: string | null; currency?: string; splitMode?: string; fixedContributionCents?: number | null; contributionDayOfMonth?: number | null;
  showBalanceToRoommates?: boolean; createdBy?: string; createdAt?: string; updatedAt?: string;
  members: MemberSrc[]; categories: CategorySrc[]; bills: BillSrc[]; payments: PaymentSrc[];
}
export interface InviteSrc { code: string; houseId?: string; status?: string; expiresAt?: string; maxUses?: number; usedCount?: number; createdBy?: string; createdAt?: string }
export interface Source {
  authUsers: AuthUserSrc[];
  profiles: Record<string, ProfileSrc>;
  documents: Record<string, DocumentSrc[]>;
  houses: HouseSrc[];
  invites: InviteSrc[];
  /** Every object in the Storage bucket: key -> size in bytes. */
  objects: Record<string, number>;
}

export type Row = Record<string, unknown>;
export interface Plan {
  user: Row[]; account: Row[]; user_documents: Row[]; houses: Row[]; members: Row[]; categories: Row[];
  bills: (Row & { files: Row[] })[]; payments: Row[]; invites: Row[];
  /** Objects to copy to R2: `from` is the Firebase Storage path, `key` the R2 key (differs only when a house id was remapped). */
  files: { from: string; key: string; size: number | null; contentType: string | null }[];
}
export interface Issue { level: 'skip' | 'fix' | 'warn'; where: string; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEG = '[A-Za-z0-9._-]+'; // keep identical to worker/src/files.ts (transform.test.ts checks the parity)
const KEYS = [new RegExp(`^users/${SEG}/avatar/${SEG}$`), new RegExp(`^users/${SEG}/documents/${SEG}/${SEG}$`), new RegExp(`^houses/${SEG}/bills/${SEG}/${SEG}$`)];
export const validKey = (k: string) => !k.split('/').some((s) => s === '.' || s === '..') && KEYS.some((r) => r.test(k));
const DOC_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const PROVIDERS: Record<string, string> = { 'google.com': 'google', 'apple.com': 'apple' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Postgres ids are UUIDs. Rows created by the app already have one; anything else (Firestore auto-ids from scripts or the
 * console) gets a deterministic UUID v5 of its old id, so a re-run maps it to the same row and references stay consistent.
 */
const NAMESPACE = Buffer.from('6f7c1b7e0c6a4b0e9d2a5f1c3b8e4a10', 'hex');
export const toUuid = (kind: string, id: string): string => {
  if (UUID.test(id)) return id.toLowerCase();
  const h = createHash('sha1').update(NAMESPACE).update(`${kind}:${id}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50; // version 5
  h[8] = (h[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};

const dateOrNull = (v: unknown) => (typeof v === 'string' && DATE.test(v) ? v : null);

export function transform(src: Source): { plan: Plan; issues: Issue[] } {
  const issues: Issue[] = [];
  const remapped: Record<string, number> = {};
  const mapId = (kind: string, id: string) => { const u = toUuid(kind, id); if (u !== id.toLowerCase()) remapped[kind] = (remapped[kind] ?? 0) + 1; return u; };
  const note = (level: Issue['level'], where: string, message: string) => issues.push({ level, where, message });
  const plan: Plan = { user: [], account: [], user_documents: [], houses: [], members: [], categories: [], bills: [], payments: [], invites: [], files: [] };
  const wanted = new Map<string, { size: number | null; contentType: string | null }>();
  const want = (key: string | null | undefined, where: string, size?: number | null, contentType?: string | null) => {
    if (!key) return;
    if (!validKey(key)) return note('warn', where, `storage path "${key}" does not fit the R2 key rules: the file will NOT be copied`);
    if (!(key in src.objects)) note('warn', where, `storage object "${key}" does not exist in the bucket`);
    wanted.set(key, { size: size ?? src.objects[key] ?? null, contentType: contentType ?? null });
  };

  // ---- users + accounts
  const emails = new Set<string>();
  const migrated = new Set<string>();
  for (const a of src.authUsers) {
    const email = a.email?.trim().toLowerCase();
    if (!email) { note('skip', `auth ${a.uid}`, 'no email (anonymous or phone-only account)'); continue; }
    if (emails.has(email)) { note('skip', `auth ${a.uid}`, `duplicate email ${email} (Better Auth emails are unique, case-insensitive)`); continue; }
    emails.add(email);
    migrated.add(a.uid);
    const p = src.profiles[a.uid];
    const created = p?.createdAt ?? a.createdAt ?? new Date().toISOString();
    if (!p) note('warn', `auth ${a.uid}`, 'no Firestore profile (users/{uid}); created with defaults');
    plan.user.push({
      id: a.uid, name: p?.displayName || a.displayName || email.split('@')[0], email, email_verified: a.emailVerified ?? false,
      image: a.photoURL ?? null, created_at: created, updated_at: p?.updatedAt ?? created, locale: p?.locale ?? null,
      account_role: p?.accountRole === 'ADMIN' || p?.accountRole === 'ROOMMATE' ? p.accountRole : 'USER', photo_key: p?.photoPath ?? null,
    });
    if (p?.photoPath) want(p.photoPath, `user ${a.uid} avatar`);
    for (const prov of a.providers) {
      if (prov.providerId === 'password') {
        if (a.passwordHash && a.passwordSalt) {
          plan.account.push({ id: `fb-credential-${a.uid}`, account_id: a.uid, provider_id: 'credential', user_id: a.uid, password: formatFirebaseHash(a.passwordHash, a.passwordSalt), created_at: created, updated_at: created });
        } else note('warn', `auth ${a.uid}`, `${email} has a password but no exported hash: they must reset it (needs the email provider)`);
      } else if (PROVIDERS[prov.providerId]) {
        plan.account.push({ id: `fb-${PROVIDERS[prov.providerId]}-${a.uid}`, account_id: prov.uid, provider_id: PROVIDERS[prov.providerId], user_id: a.uid, password: null, created_at: created, updated_at: created });
      } else note('warn', `auth ${a.uid}`, `provider ${prov.providerId} is not migrated`);
    }
    if (!a.providers.length) note('warn', `auth ${a.uid}`, 'no sign-in providers');
  }
  for (const uid of Object.keys(src.profiles)) if (!migrated.has(uid)) note('warn', `profile ${uid}`, 'Firestore profile without a migrated Auth user: skipped');

  for (const [uid, docs] of Object.entries(src.documents)) {
    if (!migrated.has(uid)) { if (docs.length) note('skip', `documents of ${uid}`, `${docs.length} identity document(s) of a user that is not migrated`); continue; }
    for (const d of docs) {
      const where = `document ${uid}/${d.id}`;
      if (d.type !== 'PASSPORT' && d.type !== 'NATIONAL_ID') { note('skip', where, `unknown type ${d.type}`); continue; }
      if (!d.storagePath || !validKey(d.storagePath)) { note('skip', where, `storage path "${d.storagePath}" is not a valid key`); continue; }
      want(d.storagePath, where, d.sizeBytes, d.mimeType);
      plan.user_documents.push({ id: mapId('document', d.id), user_id: uid, type: d.type, object_key: d.storagePath, file_name: d.fileName ?? 'file', mime_type: d.mimeType ?? 'application/octet-stream', size_bytes: d.sizeBytes ?? src.objects[d.storagePath] ?? 0, uploaded_at: d.uploadedAt ?? new Date().toISOString() });
    }
  }

  // ---- houses and everything below them
  const houseIds = new Map<string, string>(); // old id -> migrated id
  for (const h of src.houses) {
    const hw = `house ${h.id}`;
    const hid = mapId('house', h.id);
    houseIds.set(h.id, hid);
    // the house id is part of every bill file's key (houses/{id}/bills/...): rewrite those along with the id
    const keyOf = (k: string) => (hid !== h.id && k.startsWith(`houses/${h.id}/`) ? `houses/${hid}/${k.slice(`houses/${h.id}/`.length)}` : k);
    if (hid !== h.id) note('fix', hw, `id is not a UUID: migrated as ${hid} (its files move to houses/${hid}/…)`);
    plan.houses.push({
      id: hid, name: h.name ?? 'Piso', address: h.address ?? null, currency: h.currency ?? 'EUR', split_mode: h.splitMode ?? 'EQUAL',
      fixed_contribution_cents: h.fixedContributionCents ?? null, contribution_day_of_month: h.contributionDayOfMonth ?? null,
      show_balance_to_roommates: h.showBalanceToRoommates ?? true, created_by: h.createdBy && migrated.has(h.createdBy) ? h.createdBy : null,
      created_at: h.createdAt ?? new Date().toISOString(), updated_at: h.updatedAt ?? h.createdAt ?? new Date().toISOString(),
    });

    for (const m of h.members) {
      const mw = `${hw} member ${m.id}`;
      if (m.role !== 'ADMIN' && m.role !== 'ROOMMATE') { note('skip', mw, `unknown role ${m.role}`); continue; }
      let status = m.status === 'REMOVED' ? 'REMOVED' : 'ACTIVE';
      let removedAt = m.removedAt ?? null;
      const joinedAt = m.joinedAt ?? h.createdAt ?? new Date().toISOString();
      // Postgres enforces (status = ACTIVE) <=> removed_at is null; Firestore did not.
      if (status === 'ACTIVE' && removedAt) { note('fix', mw, 'ACTIVE with a removedAt date: treated as REMOVED'); status = 'REMOVED'; }
      if (status === 'REMOVED' && !removedAt) { note('fix', mw, 'REMOVED without a removedAt date: using the join date'); removedAt = joinedAt; }
      if (!m.id.startsWith('guest_') && !migrated.has(m.id)) note('warn', mw, 'member has no migrated user account (their history is kept, they cannot sign in)');
      want(m.photoPath, `${mw} avatar`);
      plan.members.push({ house_id: hid, user_id: m.id, role: m.role, status, joined_at: joinedAt, removed_at: removedAt, individual_contribution_cents: m.individualContributionCents ?? null, display_name: m.displayName ?? null, email: m.email ?? null, photo_key: m.photoPath ?? null, invite_code: m.inviteCode ?? null });
    }

    const categoryIds = new Map<string, string>();
    for (const c of h.categories) {
      const cid = mapId('category', c.id);
      categoryIds.set(c.id, cid);
      plan.categories.push({ id: cid, house_id: hid, name: c.name ?? '?', icon: c.icon ?? null, color: c.color ?? null, amount_type: c.amountType ?? 'VARIABLE', expected_amount_cents: c.expectedAmountCents ?? null, interval_unit: c.intervalUnit ?? null, interval_count: c.intervalCount ?? null, anchor_date: dateOrNull(c.anchorDate), is_active: c.isActive ?? true, sort_order: c.sortOrder ?? 0, notes: c.notes ?? null, created_at: c.createdAt ?? new Date().toISOString(), updated_at: c.updatedAt ?? c.createdAt ?? new Date().toISOString() });
    }

    for (const b of h.bills) {
      const bw = `${hw} bill ${b.id}`;
      if (!b.categoryId || !categoryIds.has(b.categoryId)) { note('skip', bw, `category ${b.categoryId} does not exist in this house`); continue; }
      if (!Number.isInteger(b.amountCents) || b.amountCents! < 1 || b.amountCents! > 9_999_999) { note('skip', bw, `amount ${b.amountCents} is out of range`); continue; }
      if ((b.notes ?? '').length > 1000) { note('skip', bw, 'notes longer than 1000 characters'); continue; }
      // `files` (new) or the legacy single-file fields (= the first file)
      let files: FileRefSrc[] = b.files ?? (b.fileStoragePath ? [{ storagePath: b.fileStoragePath, fileName: b.fileName ?? undefined, mimeType: b.fileMimeType ?? undefined, sizeBytes: b.fileSizeBytes ?? undefined }] : []);
      if (files.length > 5) { note('fix', bw, `${files.length} files: only the first 5 are kept`); files = files.slice(0, 5); }
      const rows: Row[] = [];
      files.forEach((f, position) => {
        if (!f.storagePath || !validKey(f.storagePath)) { note('warn', bw, `file "${f.storagePath}" has an invalid key: the reference is dropped`); return; }
        if (!DOC_MIME.includes(f.mimeType ?? '')) note('warn', bw, `file ${f.storagePath} has mime type "${f.mimeType}"`);
        want(f.storagePath, bw, f.sizeBytes, f.mimeType);
        rows.push({ object_key: keyOf(f.storagePath), file_name: f.fileName ?? 'file', mime_type: f.mimeType ?? 'application/octet-stream', size_bytes: f.sizeBytes ?? src.objects[f.storagePath] ?? 0, position });
      });
      const created = b.createdAt ?? new Date().toISOString();
      // Postgres derives effective_date (charge ?? period end ?? creation day, UTC): it must agree with what Firestore stored.
      const expected = dateOrNull(b.chargeDate) ?? dateOrNull(b.periodEndDate) ?? created.slice(0, 10);
      if (b.effectiveDate && b.effectiveDate !== expected) note('warn', bw, `Firestore effectiveDate ${b.effectiveDate} differs from the derived ${expected}: reports for this bill will shift`);
      plan.bills.push({ id: mapId('bill', b.id), house_id: hid, category_id: categoryIds.get(b.categoryId)!, amount_cents: b.amountCents, charge_date: dateOrNull(b.chargeDate), period_start_date: dateOrNull(b.periodStartDate), period_end_date: dateOrNull(b.periodEndDate), notes: b.notes ?? null, ocr_status: b.ocrStatus ?? 'NONE', ocr_data: b.ocrData ?? null, created_by: b.createdBy && migrated.has(b.createdBy) ? b.createdBy : null, created_at: created, updated_at: b.updatedAt ?? created, files: rows });
    }

    const memberIds = new Set(plan.members.filter((m) => m.house_id === hid).map((m) => m.user_id));
    for (const p of h.payments) {
      const pw = `${hw} payment ${p.id}`;
      if (!Number.isInteger(p.amountCents) || p.amountCents! < 1) { note('skip', pw, `amount ${p.amountCents} is not positive`); continue; }
      if (!p.month || !/^\d{4}-\d{2}-01$/.test(p.month)) { note('skip', pw, `month "${p.month}" is not the first day of a month`); continue; }
      if (!p.memberId || !memberIds.has(p.memberId)) note('warn', pw, `member ${p.memberId} is not a member of this house (kept: history)`);
      plan.payments.push({ id: mapId('payment', p.id), house_id: hid, member_id: p.memberId ?? '', month: p.month, amount_cents: p.amountCents, note: p.note ?? null, paid_at: p.paidAt ?? new Date().toISOString(), recorded_by: p.recordedBy ?? '' });
    }
  }

  for (const i of src.invites) {
    const iw = `invite ${i.code}`;
    if (!i.houseId || !houseIds.has(i.houseId)) { note('skip', iw, `house ${i.houseId} was not migrated`); continue; }
    plan.invites.push({ code: i.code, house_id: houseIds.get(i.houseId)!, status: i.status === 'REVOKED' ? 'REVOKED' : 'ACTIVE', expires_at: i.expiresAt ?? new Date().toISOString(), max_uses: i.maxUses ?? 1, used_count: i.usedCount ?? 0, created_by: i.createdBy ?? '', created_at: i.createdAt ?? new Date().toISOString() });
  }

  for (const [key, size] of Object.entries(src.objects)) {
    if (!wanted.has(key)) note('warn', `storage ${key}`, validKey(key) ? 'object is not referenced by any migrated row: it is copied anyway' : 'object key does not fit the R2 key rules and is not referenced: not copied');
    if (!wanted.has(key) && validKey(key)) wanted.set(key, { size, contentType: null });
  }
  const targetOf = (from: string) => {
    const m = /^houses\/([^/]+)\//.exec(from);
    const hid = m && houseIds.get(m[1]!);
    return hid && hid !== m![1] ? `houses/${hid}/${from.slice(m![0].length)}` : from;
  };
  for (const [from, v] of wanted) if (validKey(from) && from in src.objects) plan.files.push({ from, key: targetOf(from), size: v.size, contentType: v.contentType });
  for (const [kind, n] of Object.entries(remapped)) if (kind !== 'house') note('fix', `${kind}s`, `${n} id(s) were not UUIDs (Firestore auto-ids): migrated with a deterministic UUID derived from the old id`);
  return { plan, issues };
}
