import type { AppMode } from '../appMode';
import type { Api } from './types';

/** Forwards every call to local or cloud, resolving the mode at call time so cloud behaviour is unchanged. */
export const createApi = (getMode: () => AppMode, local: Api, cloud: Api): Api =>
  new Proxy({} as Api, {
    get:
      (_t, name) =>
      (...args: unknown[]) => {
        const target = (getMode() === 'local' ? local : cloud) as unknown as Record<string, (...a: unknown[]) => unknown>;
        return target[name as string](...args);
      },
  });
