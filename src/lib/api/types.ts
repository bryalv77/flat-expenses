import type {
  AmountType,
  Bill,
  BillFile,
  DocumentType,
  ExpenseCategory,
  House,
  HouseInvite,
  HouseMember,
  HouseRole,
  IntervalUnit,
  Locale,
  MemberPayment,
  SplitMode,
  User,
  UserDocument,
} from '@/types/domain';

// ---------- input shapes ----------
export type HouseWithRole = House & { role: HouseRole };

export interface CreateHouseInput {
  id: string;
  name: string;
  address?: string | null;
  splitMode?: SplitMode;
  fixedContributionCents?: number | null;
  contributionDayOfMonth?: number | null;
  showBalanceToRoommates?: boolean;
}
export type UpdateHouseInput = Partial<Omit<CreateHouseInput, 'id'>> & { houseId: string };

export interface CategoryInput {
  name: string;
  icon: string;
  color: string;
  amountType: AmountType;
  expectedAmountCents?: number | null;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  anchorDate: string;
  isActive?: boolean;
  sortOrder?: number;
  notes?: string | null;
  names?: ExpenseCategory['names'];
}

export interface BillInput {
  categoryId: string;
  amountCents: number;
  chargeDate?: string | null;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  files?: BillFile[];
  notes?: string | null;
}

/** The data-layer contract: every backend (Worker HTTP, local SQLite) exposes exactly this shape. */
export interface Api {
  // User
  upsertUser(v: { email: string; displayName: string; locale?: Locale; accountRole?: HouseRole }): Promise<void>;
  getMe(): Promise<User | null>;
  updateMyProfile(v: { displayName?: string; photoPath?: string | null; locale?: Locale; accountRole?: HouseRole }): Promise<void>;
  listMyDocuments(): Promise<UserDocument[]>;
  addMyDocument(v: { id: string; type: DocumentType; storagePath: string; fileName: string; mimeType: string; sizeBytes: number }): Promise<void>;
  deleteMyDocument(v: { id: string }): Promise<void>;
  listMemberDocuments(v: { houseId: string; userId: string }): Promise<UserDocument[]>;
  deleteMyAccountData(): Promise<void>;

  // Houses
  createHouse(v: CreateHouseInput): Promise<void>;
  updateHouse(v: UpdateHouseInput): Promise<void>;
  listMyHouses(): Promise<HouseWithRole[]>;
  getHouse(v: { houseId: string }): Promise<{ house: House; members: HouseMember[] } | null>;
  deleteHouse(v: { houseId: string }): Promise<void>;

  // Members & invites
  createInvite(v: { houseId: string; code: string; expiresAt: string; maxUses: number }): Promise<void>;
  revokeInvite(v: { houseId: string; inviteId: string }): Promise<void>;
  listInvites(v: { houseId: string }): Promise<HouseInvite[]>;
  redeemInvite(v: { code: string }): Promise<void>;
  removeMember(v: { houseId: string; memberId: string; removedAt?: string }): Promise<void>;
  reactivateMember(v: { houseId: string; memberId: string }): Promise<void>;
  createGuestMember(v: {
    houseId: string;
    id: string;
    displayName: string;
    joinedAt: string;
    removedAt: string | null;
    individualContributionCents: number | null;
  }): Promise<void>;
  setMemberContribution(v: { houseId: string; memberId: string; individualContributionCents: number | null }): Promise<void>;
  leaveHouse(v: { houseId: string }): Promise<void>;
  listMembers(v: { houseId: string }): Promise<HouseMember[]>;

  // Categories
  createCategory(v: CategoryInput & { houseId: string; id: string }): Promise<void>;
  updateCategory(v: Partial<CategoryInput> & { houseId: string; id: string }): Promise<void>;
  archiveCategory(v: { houseId: string; id: string; isActive: boolean }): Promise<void>;
  deleteCategory(v: { houseId: string; id: string }): Promise<void>;
  listCategories(v: { houseId: string }): Promise<ExpenseCategory[]>;
  setCategorySortOrder(v: { houseId: string; id: string; sortOrder: number }): Promise<void>;

  // Bills
  createBill(v: BillInput & { houseId: string; id: string }): Promise<void>;
  updateBill(v: Partial<BillInput> & { houseId: string; id: string }): Promise<void>;
  deleteBill(v: { houseId: string; id: string }): Promise<void>;
  getBill(v: { houseId: string; id: string }): Promise<Bill | null>;
  listBills(v: { houseId: string; from: string; to: string; categoryId?: string }): Promise<Bill[]>;

  // Payments
  recordPayment(v: { houseId: string; id: string; memberId: string; month: string; amountCents: number; note?: string | null }): Promise<void>;
  deletePayment(v: { houseId: string; id: string }): Promise<void>;
  listPayments(v: { houseId: string; from: string; to: string }): Promise<MemberPayment[]>;
}
