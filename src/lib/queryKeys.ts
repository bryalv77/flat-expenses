export const qk = {
  me: ['me'] as const,
  myDocuments: ['my-documents'] as const,
  memberDocuments: (houseId: string, userId: string) => ['member-documents', houseId, userId] as const,
  houses: ['houses'] as const,
  house: (houseId: string) => ['house', houseId] as const,
  members: (houseId: string) => ['members', houseId] as const,
  invites: (houseId: string) => ['invites', houseId] as const,
  categories: (houseId: string) => ['categories', houseId] as const,
  /** Prefix: invalidates every bill list/detail of a house. */
  billsOf: (houseId: string) => ['bills', houseId] as const,
  bills: (houseId: string, from: string, to: string, categoryId?: string) =>
    ['bills', houseId, 'list', from, to, categoryId ?? 'all'] as const,
  bill: (houseId: string, id: string) => ['bills', houseId, 'detail', id] as const,
  paymentsOf: (houseId: string) => ['payments', houseId] as const,
  payments: (houseId: string, from: string, to: string) => ['payments', houseId, from, to] as const,
  fileUrl: (path: string) => ['file-url', path] as const,
};
