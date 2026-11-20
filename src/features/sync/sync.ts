import { LOCAL_USER_ID } from '@/lib/api/local/ctx';
import type { Api } from '@/lib/api/types';
import type { PickedFile } from '@/lib/storage';
import type { Bill, ExpenseCategory, House, HouseMember, MemberPayment } from '@/types/domain';

/**
 * Local→cloud sync (additive, per house). Reads a snapshot of the on-device SQLite data, then creates
 * the houses that don't yet exist in the cloud account. Existing cloud houses are never touched.
 *
 * All dependencies are injected so the logic is testable with fakes (no expo-sqlite / network imports).
 */

export interface LocalHouseData {
  house: House & { role?: string };
  members: HouseMember[];
  categories: ExpenseCategory[];
  bills: Bill[];
  payments: MemberPayment[];
}

/** Wide enough to read every row regardless of its date. */
const ALL_BILLS = { from: '0000-01-01', to: '9999-12-31' };
const ALL_PAYMENTS = { from: '2000-01-01', to: '2099-12-01' };

export interface SyncDeps {
  /** The cloud API (writes to the signed-in account). */
  cloud: Api;
  /** The signed-in cloud user id (the local 'local' admin becomes this member). */
  uid: string;
  /** Resolves a local storage key to a readable URI for upload. */
  localFileUrl: (path: string) => Promise<string>;
  /** Uploads a local file to the cloud under the same storage key. */
  uploadFile: (path: string, file: PickedFile) => Promise<unknown>;
  onProgress?: (done: number, total: number) => void;
}

/** A member `joinedAt`/`removedAt` is an ISO datetime in local mode; the cloud guest API wants a day. */
const dayOf = (iso: string): string => iso.slice(0, 10);

/** Reads every local house with its full content. */
export async function readLocalHouses(local: Api): Promise<LocalHouseData[]> {
  const houses = await local.listMyHouses();
  return Promise.all(
    houses.map(async (house) => {
      const [detail, categories, bills, payments] = await Promise.all([
        local.getHouse({ houseId: house.id }),
        local.listCategories({ houseId: house.id }),
        local.listBills({ houseId: house.id, ...ALL_BILLS }),
        local.listPayments({ houseId: house.id, ...ALL_PAYMENTS }),
      ]);
      return { house, members: detail?.members ?? [], categories, bills, payments };
    }),
  );
}

/**
 * Creates each local house (and its members, categories, bills + files, payments) that is not already
 * in `cloudHouseIds`. Returns the number of houses uploaded. Throws on the first failure without any
 * partial cleanup (the caller decides whether to wipe local data only after a full success).
 */
export async function uploadLocalToCloud(deps: SyncDeps, local: LocalHouseData[], cloudHouseIds: Set<string>): Promise<number> {
  const todo = local.filter((l) => !cloudHouseIds.has(l.house.id));
  let done = 0;
  for (const { house, members, categories, bills, payments } of todo) {
    await deps.cloud.createHouse({
      id: house.id,
      name: house.name,
      address: house.address ?? undefined,
      splitMode: house.splitMode,
      fixedContributionCents: house.fixedContributionCents ?? undefined,
      contributionDayOfMonth: house.contributionDayOfMonth ?? undefined,
      showBalanceToRoommates: house.showBalanceToRoommates,
    });

    // The local admin ('local') becomes the signed-in user via createHouse; everyone else is a guest.
    const admin = members.find((m) => m.userId === LOCAL_USER_ID);
    if (admin?.individualContributionCents != null) {
      await deps.cloud.setMemberContribution({
        houseId: house.id,
        memberId: deps.uid,
        individualContributionCents: admin.individualContributionCents,
      });
    }
    for (const m of members) {
      if (m.userId === LOCAL_USER_ID) continue;
      await deps.cloud.createGuestMember({
        houseId: house.id,
        id: m.userId,
        displayName: m.displayName || 'Roommie',
        joinedAt: dayOf(m.joinedAt),
        removedAt: m.removedAt ? dayOf(m.removedAt) : null,
        individualContributionCents: m.individualContributionCents,
      });
    }

    for (const c of categories) {
      await deps.cloud.createCategory({
        houseId: house.id,
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        amountType: c.amountType,
        expectedAmountCents: c.expectedAmountCents ?? undefined,
        intervalUnit: c.intervalUnit,
        intervalCount: c.intervalCount,
        anchorDate: c.anchorDate,
        isActive: c.isActive,
        sortOrder: c.sortOrder,
        notes: c.notes ?? undefined,
      });
    }

    for (const b of bills) {
      const files = [];
      for (const f of b.files) {
        const uri = await deps.localFileUrl(f.storagePath);
        await deps.uploadFile(f.storagePath, { uri, name: f.fileName, mimeType: f.mimeType, size: f.sizeBytes });
        files.push({ storagePath: f.storagePath, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
      }
      await deps.cloud.createBill({
        houseId: house.id,
        id: b.id,
        categoryId: b.categoryId,
        amountCents: b.amountCents,
        chargeDate: b.chargeDate ?? undefined,
        periodStartDate: b.periodStartDate ?? undefined,
        periodEndDate: b.periodEndDate ?? undefined,
        files,
        notes: b.notes ?? undefined,
      });
    }

    for (const p of payments) {
      await deps.cloud.recordPayment({
        houseId: house.id,
        id: p.id,
        memberId: p.memberId === LOCAL_USER_ID ? deps.uid : p.memberId,
        month: p.month,
        amountCents: p.amountCents,
        note: p.note ?? undefined,
      });
    }

    done += 1;
    deps.onProgress?.(done, todo.length);
  }
  return done;
}

export type SyncScenario =
  | { kind: 'nothing' }
  | { kind: 'upload'; localCount: number }
  | { kind: 'choose'; localCount: number };

/** Decides what to show based on whether local and cloud each have houses. */
export function computeSyncDecision(localCount: number, cloudCount: number): SyncScenario {
  if (localCount === 0) return { kind: 'nothing' };
  if (cloudCount === 0) return { kind: 'upload', localCount };
  return { kind: 'choose', localCount };
}
