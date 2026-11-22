import type { firestoreApi } from '../firestoreApi';

/** The data-layer contract: every backend (Firestore, Worker HTTP, local SQLite) exposes exactly this shape. */
export type Api = typeof firestoreApi;
