import type { firestoreApi } from '../db';

/** The data-layer contract: every backend (Firestore, Worker HTTP, local SQLite) exposes exactly this shape. */
export type Api = typeof firestoreApi;
