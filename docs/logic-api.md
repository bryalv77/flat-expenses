# Logic API (pure, unit-tested)

All money is **integer cents**. Dates are `YYYY-MM-DD`, months are `YYYY-MM`; everything is timezone-safe
(no `Date` parsing of ISO strings). Import with the `@/` alias. Run tests with `npm test`.

## `@/lib/dates`
- `parseISODate(iso): {y,m,d}` · `toISODate({y,m,d}): string` · `todayISO(now?): string`
- `isLeapYear(y)` · `daysInMonth(y, m)` · `toDayNumber(iso)` · `fromDayNumber(n)`
- `addDays(iso, days)` · `addMonthsClamped(anchorIso, months)` (clamps to month end; pass the anchor to avoid drift)
- `compareISO(a, b)` · `monthKey(iso)` · `monthStart(key)` · `monthEnd(key)` · `monthOfYear(iso)`
- `addMonthsToKey(key, n)` · `monthRange(fromKey, toKey): string[]` (inclusive) · `monthDiff(a, b)`

## `@/lib/format` (locale: `'es' | 'en'`, default `'es'`)
- `formatMoney(cents, locale?, {currency?, compact?}): string` → `1.200,00 €` (`compact` drops decimals)
- `formatSignedMoney(cents, locale?, currency?)` → `+38,40 €` / `-120,00 €`
- `parseMoneyToCents(input, locale?): number | null` (accepts `1.200,50`, `1200,5`, `1,200.50`, `€ 15`)
- `centsToInputString(cents, locale?)` → `1200,50`
- `formatDate(iso, locale?, 'short'|'medium'|'long')` · `formatMonth(key, locale?, 'long'|'short')`
- `formatMonthName(monthOfYear 1-12, locale?, 'long'|'short')` · `formatPercent(ratio, locale?, digits?)`
- `formatFileSize(bytes)`

## `@/features/members/inviteCode`
- `INVITE_ALPHABET` · `INVITE_CODE_LENGTH` (8)
- `generateInviteCode(random = Math.random): string` (inject a CSPRNG in production)
- `normalizeInviteCode(input): string` (uppercase, strips separators and ambiguous chars, max 8)
- `formatInviteCode(code): string` → `K7QX-M2PD` · `isValidInviteCode(input): boolean`

## `@/features/schedule/occurrences`
- `occurrenceAt(schedule, n): string` — n-th occurrence from the anchor (n ≥ 0)
- `getOccurrences(schedule, from, to): string[]` — inclusive; anchor is the first occurrence
- `getNextOccurrence(schedule, today): string | null` — on/after today
- `getUpcomingCharges(categories, today, days = 30): UpcomingCharge[]` — `{category, date, expectedAmountCents}`
- `cycleLengthInMonths(schedule): number`
- `amortizedMonthlyCents(schedule, amountCents): number` — bi-monthly 80 € → 40 €
- `describeSchedule(category, locale?): {interval, amount, full}` — `Cada 4 semanas · 15,00 €`, `Cada 2 meses · variable`
- `schedule` = `{intervalUnit, intervalCount, anchorDate}` (an `ExpenseCategory` works)

## `@/features/finance` (barrel: effectiveDate, members, split, contributions)
- `getEffectiveDate(bill)` / `getEffectiveMonth(bill)` — chargeDate → periodEndDate → createdAt date
- `isMemberActiveInMonth(member, month)` · `activeMembersInMonth(members, month)` — respects `joinedAt`/`removedAt`, sorted by join date
- `splitEqual(totalCents, orderedMemberIds): Share[]` — `{memberId, cents}`, leftover cents to the earliest members
- `computeMonthShares(bills, members, month): MonthShares` — `{totalCents, memberIds, perMember, perCategory[]}` (Mode A)
- `contributionForMember(house, member)` — per-member override else house fixed contribution
- `balanceStatus(balanceCents): 'SUFFICIENT'|'INSUFFICIENT'|'SURPLUS'` (0 = SUFFICIENT)
- `computeMonthBalance(house, members, month, totalSpentCents): MonthBalance` — expected income (active ROOMMATES), balance, status, `equalShares`, `contributions`
- `computeBalanceSeries(house, members, fromMonth, toMonth, totalsByMonth): BalanceSeriesRow[]` — adds `cumulativeBalanceCents`
- `recommendContribution(trailingMonthlyTotals, roommateCount, marginCents = 0)` → `{averageMonthlySpendCents, breakEvenCents, withMarginCents, monthsConsidered} | null`
- `computePaymentStatus(house, members, payments, month): MonthPaymentSummary` — per roommate `PAID|PARTIAL|PENDING|OVERPAID`, totals due/paid/pending

## `@/features/reports` (barrel: calculations, projection)
Bills are anything with `{categoryId, amountCents, chargeDate, periodEndDate, createdAt}` (`BillCore`).
- `filterBills(bills, from, to, categoryId?)` · `sumCents(bills)` · `totalsByMonth(bills): Record<month, cents>`
- `lastNMonths(endMonth, n): string[]`
- `monthlySeries(bills, fromMonth, toMonth): {month, totalCents, byCategory}[]` — zero-filled, for stacked bars
- `categoryBreakdown(bills): {categoryId, totalCents, ratio}[]` · `computeDelta(current, previous): {deltaCents, ratio|null}`
- `amortizedMonthlyTotals(bills, cycles)` · `cyclesOf(categories)`
- `categoryStats(bills, category): CategoryStats` — `billCount, totalCents, avgPerBillCents, avgPerMonthCents (amortized), min/maxBillCents, series, amortizedSeries, trendCentsPerMonth, trend 'UP'|'DOWN'|'FLAT'`
- `linearSlope(values)`
- `computeSeasonality(bills, categories, categoryId?): Seasonality` — `byMonthOfYear[0..11]`, `yearlyAverageCents`, `summerAverageCents` (Jun–Sep), `winterAverageCents` (Dec–Feb), `summerFactor`, `winterFactor`, `yearOverYear[{year, months[12]}]`
- `lookupMonth(bills, month, categoryId?): {totalCents, billCount, bills}`
- `perPersonTable(bills, members, fromMonth, toMonth): {rows[{month,totalCents,shares}], cumulativeByMember}`
- `buildBillsCsv(bills, categories, {delimiter?}): string` (CRLF; amounts like `80.50`; prepend `﻿` for Excel)
- `centsToPlainDecimal(cents)`
- `projectMonth({targetMonth, categories, bills, members, house, options?}): MonthProjection` — `totalCents, lowCents, highCents, perCategory[{categoryId, basis, occurrences, estimateCents, lowCents, highCents}], confidence 'HIGH'|'MEDIUM'|'LOW', monthsOfData, perPerson, balance, balanceLowSpendCents, balanceHighSpendCents`
- `projectionConfidence(monthsOfData)` (≥12 HIGH, ≥6 MEDIUM) · `weightedRecentAverage(values)`

### Notes
- Projection basis: FIXED → `SCHEDULE` (occurrences × expected amount); VARIABLE → `LAST_YEAR` if a bill exists in the same month one year earlier, else `TRAILING_AVERAGE` (last 6 bills, recency-weighted, seasonally adjusted with ≥ 12 months of data), else `NONE`. A VARIABLE category with no scheduled occurrence in the month contributes 0.
- UI copy for confidence: HIGH/MEDIUM → "Basado en N meses de datos"; LOW → "Pocos datos: estimación aproximada".
- Missing months inside the data range count as 0 in seasonality/amortized series.
