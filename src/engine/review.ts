// Monthly review (SPEC, "Revisão mensal"): five steps, each found done from what is already
// recorded, so the checklist needs no storage of its own. Pure.
import { addDays } from '../domain/calendar';
import { AMOUNT_INSTRUMENTS, type ContributionPlan, type DecisionLog, type IsoDate, type PensionPlan, type Position, type Reconciliation, type Transaction } from '../domain/types';
import type { Valuation } from '../domain/valuation';

/** A balance informed in the last month counts as updated: statements come at the turn of the month. */
export const FRESH_BALANCE_DAYS = 31;

export interface ReviewStatus {
  month: string;
  /** Reserve positions held by amount, and how many got a bank balance recently. */
  reserveBalances: { updated: number; total: number };
  pensionBalances: { updated: number; total: number };
  lastMovement: IsoDate | null;
  /** The month's contribution plan, when there is one. */
  plan: ContributionPlan | null;
  /** The month's entries in the diary, apart from sale intentions and the review itself. */
  decisions: number;
  /** The diary entry that closed the month's review. */
  closed: DecisionLog | null;
}

export interface ReviewInput {
  today: IsoDate;
  positions: readonly Position[];
  valuations: ReadonlyMap<string, Valuation>;
  reconciliations: readonly Reconciliation[];
  pensionPlans: readonly PensionPlan[];
  transactions: readonly Transaction[];
  contributionPlans: readonly ContributionPlan[];
  decisionLogs: readonly DecisionLog[];
}

export function reviewStatus(input: ReviewInput): ReviewStatus {
  const month = input.today.slice(0, 7);
  const since = addDays(input.today, -FRESH_BALANCE_DAYS);
  const reserve = input.positions.filter(
    p => p.bucket === 'reserva' && (AMOUNT_INSTRUMENTS as readonly string[]).includes(p.instrumentType) && input.valuations.get(p.id)?.open,
  );
  const updated = reserve.filter(p => input.reconciliations.some(r => r.positionId === p.id && r.date >= since));
  const pensions = input.pensionPlans.filter(plan => plan.balances.some(b => b.date >= since));
  const lastMovement = input.transactions.reduce<IsoDate | null>((last, t) => (!last || t.date > last ? t.date : last), null);
  const inMonth = <T extends { date: IsoDate }>(items: readonly T[]) => items.filter(i => i.date.startsWith(month));
  return {
    month,
    reserveBalances: { updated: updated.length, total: reserve.length },
    pensionBalances: { updated: pensions.length, total: input.pensionPlans.length },
    lastMovement,
    plan: inMonth(input.contributionPlans).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    decisions: inMonth(input.decisionLogs).filter(d => !d.saleIntent && d.type !== 'revisao').length,
    closed: inMonth(input.decisionLogs).find(d => d.type === 'revisao') ?? null,
  };
}
