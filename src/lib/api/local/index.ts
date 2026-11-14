import type { Api } from '../types';

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`Not implemented: ${what}`);
    this.name = 'NotImplementedError';
  }
}

/** Stub: every method throws. T4 replaces this Proxy cast with the real SQLite-backed object. */
export const localApi = new Proxy({} as Api, {
  get: (_t, name) => () => {
    throw new NotImplementedError(`localApi.${String(name)}`);
  },
});
