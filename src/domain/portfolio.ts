// Totals of the whole portfolio: the reserve, the free portfolio by class and the pension plans
// (SPEC, "Início" and "Política de investimento inicial").
import type { Market } from './market';
import { latestBalance } from './pension';
import { ASSET_CLASSES, type AssetClass, type Cents, type IsoDate, type PensionPlan, type Position, type Reconciliation, type Transaction } from './types';
import { valuePosition, type Valuation } from './valuation';

export interface Totals {
  costCents: Cents;
  grossCents: Cents;
  netCents: Cents;
}

export interface PortfolioValue {
  valuations: ReadonlyMap<string, Valuation>;
  reserve: Totals;
  free: Totals;
  /** Free portfolio only: the policy targets apply to it. */
  byClass: Record<AssetClass, Totals>;
  /** Latest balance of each plan, own plus company parts. */
  pensionCents: Cents;
  /** Open positions valued, at least in part, at cost. */
  unpricedCount: number;
}

export interface PortfolioInput {
  positions: readonly Position[];
  transactions: readonly Transaction[];
  reconciliations: readonly Reconciliation[];
  pensionPlans: readonly PensionPlan[];
  market: Market;
  today: IsoDate;
}

const zero = (): Totals => ({ costCents: 0, grossCents: 0, netCents: 0 });

function add(into: Totals, v: Valuation) {
  into.costCents += v.costCents;
  into.grossCents += v.grossCents;
  into.netCents += v.netCents;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

export function valuePortfolio({ positions, transactions, reconciliations, pensionPlans, market, today }: PortfolioInput): PortfolioValue {
  const txByPosition = groupBy(transactions, t => t.positionId);
  const recByPosition = groupBy(reconciliations, r => r.positionId);
  const valuations = new Map<string, Valuation>();
  const reserve = zero();
  const free = zero();
  const byClass = Object.fromEntries(ASSET_CLASSES.map(c => [c, zero()])) as Record<AssetClass, Totals>;
  let unpricedCount = 0;
  for (const p of positions) {
    const v = valuePosition(p, txByPosition.get(p.id) ?? [], recByPosition.get(p.id) ?? [], market, today);
    valuations.set(p.id, v);
    if (v.open && !v.priced) unpricedCount++;
    if (p.bucket === 'reserva') {
      add(reserve, v);
    } else {
      add(free, v);
      add(byClass[p.assetClass], v);
    }
  }
  const pensionCents = pensionPlans.reduce((total, plan) => {
    const b = latestBalance(plan);
    return total + (b ? b.ownCents + b.companyCents : 0);
  }, 0);
  return { valuations, reserve, free, byClass, pensionCents, unpricedCount };
}

/** Months of living cost the reserve covers, rounded down to a tenth; null without a cost. */
export function reserveMonths(reserveCents: Cents, monthlyCostCents: Cents): number | null {
  if (monthlyCostCents <= 0) return null;
  return Math.floor((Math.max(reserveCents, 0) * 10) / monthlyCostCents) / 10;
}
