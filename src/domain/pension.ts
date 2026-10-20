// Pension plan with company match and vesting (SPEC, "Previdência (PGBL)", "Cálculos").
import { addYears, completedYears } from './calendar';
import { Dec, scaleCents } from './decimal';
import type { Cents, IsoDate, PensionBalance, PensionPlan, VestingStep } from './types';

export function latestBalance(plan: Pick<PensionPlan, 'balances'>): PensionBalance | null {
  return plan.balances.reduce<PensionBalance | null>((last, b) => (!last || b.date > last.date ? b : last), null);
}

const byYears = (table: readonly VestingStep[]) => [...table].sort((a, b) => a.years - b.years);

/**
 * Share of the company's part already released on a date. Plan years count by anniversaries of
 * the start date. Without intermediate steps, the last step reached holds (SPEC).
 */
export function vestedPct(plan: Pick<PensionPlan, 'startDate' | 'vestingTable'>, on: IsoDate): number {
  const years = completedYears(plan.startDate, on);
  let pct = 0;
  for (const step of byYears(plan.vestingTable)) if (step.years <= years) pct = step.pct;
  return pct;
}

export interface PensionStatus {
  balance: PensionBalance | null;
  vestedPct: number;
  /** Own part plus the company's part already released, rounded down. */
  guaranteedCents: Cents;
  nextStep: { date: IsoDate; pct: number; releasesCents: Cents } | null;
}

export function pensionStatus(plan: PensionPlan, on: IsoDate): PensionStatus {
  const balance = latestBalance(plan);
  const pct = vestedPct(plan, on);
  const company = balance?.companyCents ?? 0;
  const released = (share: number) => scaleCents(company, new Dec(share).div(100), 'truncate');
  const years = completedYears(plan.startDate, on);
  const next = byYears(plan.vestingTable).find(step => step.years > years && step.pct > pct);
  return {
    balance,
    vestedPct: pct,
    guaranteedCents: (balance?.ownCents ?? 0) + released(pct),
    nextStep: next
      ? { date: addYears(plan.startDate, next.years), pct: next.pct, releasesCents: released(next.pct) - released(pct) }
      : null,
  };
}
