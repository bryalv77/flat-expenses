/** Rejects with `Error('timeout')` when `p` has not settled after `ms`. */
export const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });

/** `p`'s value, or `fallback` when it takes longer than `ms` (or fails). */
export const orTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> => withTimeout(p, ms).catch(() => fallback);
