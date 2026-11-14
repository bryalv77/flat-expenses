// Platform-neutral entry so TypeScript resolves './fileStore.local'; Metro picks fileStore.local.native.ts / .web.ts.
// Both export the same `localFileStore: FileStore`.
export { localFileStore } from './fileStore.local.native';
