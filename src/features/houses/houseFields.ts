import { z } from 'zod';

import type { useT } from '@/i18n';

type T = ReturnType<typeof useT>['t'];

/** The house form schema both screens use (one set of rules); `extra` adds the screen's own fields. */
export const houseSchema = <E extends z.ZodRawShape>(t: T, extra: E) =>
  z
    .object({
      name: z.string().trim().min(1, t('account.houseNameRequired')).max(80),
      address: z.string().trim().max(160),
      splitMode: z.enum(['EQUAL', 'FIXED_CONTRIBUTION']),
      fixedContributionCents: z.number().int().min(0).nullable(),
      contributionDayOfMonth: z.number().int().min(1).max(28).nullable(),
      ...extra,
    })
    .refine(
      (v) => {
        const { splitMode, fixedContributionCents } = v as {
          splitMode: string;
          fixedContributionCents: number | null;
        };
        return splitMode !== 'FIXED_CONTRIBUTION' || (fixedContributionCents !== null && fixedContributionCents > 0);
      },
      {
        path: ['fixedContributionCents'],
        message: t('account.fixedRequired'),
      },
    );

/** Text input -> day number (digits only); empty -> null. */
export function parseDayInput(text: string): number | null {
  const n = parseInt(text.replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}
