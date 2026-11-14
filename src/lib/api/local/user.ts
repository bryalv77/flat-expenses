import type { Api } from '../types';
import type { LocalCtx } from './ctx';

/** Owned by its task (see docs/local-mode-plan.md); returns the Api methods of this domain. */
export function makeUserApi(_ctx: LocalCtx): Partial<Api> {
  return {};
}
