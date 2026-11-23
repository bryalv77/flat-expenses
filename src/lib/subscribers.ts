/** Listener set for module-level state read through `useSyncExternalStore(subscribe, getSnapshot)`. */
export function createSubscribers() {
  const listeners = new Set<() => void>();
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    notify: () => listeners.forEach((fn) => fn()),
  };
}
