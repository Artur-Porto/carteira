// Values a position from its transactions and the market data (SPEC, "Modelo de dados" and
// "Rendimento da reserva"). Quantity, cost and lots are derived here on every reading, never
// stored: a withdrawal by amount takes from each lot according to what the lot had earned, so
// stored lots would go stale whenever a rate or an earlier movement changed.
import { accrualFor, type AccrualSource } from './accrual';
import { daysBetween } from './calendar';
import { Dec, ONE, ZERO, dec, reais, toCents } from './decimal';
import { bondKey, type Market } from './market';
import { fixedIncomeTax } from './tax';
import {
  instrumentFamily,
  type Cents,
  type InstrumentFamily,
  type IsoDate,
  type Position,
  type Reconciliation,
  type Transaction,
  type TransactionType,
} from './types';

export type ValuationIssue =
  /** No price or rate for the asset, so it is valued at cost. */
  | 'sem-preco'
  /** The rate history starts after a lot was applied; that lot is valued at cost. */
  | 'sem-historico'
  /** The holiday list has not arrived yet, so business days skip weekends only. */
  | 'sem-feriados'
  /** The maturity date passed and the redemption was not recorded. */
  | 'vencida'
  /** A withdrawal or sale took more than the app had for the position. */
  | 'saida-maior'
  /** A movement of a Tesouro bond or a market asset came without a quantity. */
  | 'sem-quantidade';

export interface LotValue {
  /** Id of the buy or deposit that opened the lot. */
  id: string;
  date: IsoDate;
  quantity: Dec | null;
  costCents: Cents;
  grossCents: Cents;
  /** Calendar days from the application to the valuation, which set the income-tax bracket. */
  days: number;
  iofCents: Cents;
  irCents: Cents;
}

export interface Valuation {
  positionId: string;
  family: InstrumentFamily;
  /** Units held, for assets traded in units. */
  quantity: Dec | null;
  costCents: Cents;
  grossCents: Cents;
  iofCents: Cents;
  irCents: Cents;
  /** Gross minus the estimated IOF and income tax. */
  netCents: Cents;
  /** Fixed income only. Variable income has no estimate: its tax depends on the month's sales. */
  taxEstimated: boolean;
  /** False when some of the value is the cost, for lack of a price or rate. */
  priced: boolean;
  /** True when some days use rates not published yet, repeated from the last one. */
  estimated: boolean;
  /** Date of the price, or of the last published rate, behind the value. */
  dataDate: IsoDate | null;
  lots: LotValue[];
  incomeCents: Cents;
  /** Gain already taken out: proceeds minus the cost of what left. */
  realizedCents: Cents;
  lastReconciliation: { date: IsoDate; balanceCents: Cents; differenceCents: Cents } | null;
  issues: ValuationIssue[];
  /** Still held: some quantity or amount is left. */
  open: boolean;
}

type Event = { date: IsoDate; rank: number; createdAt: string } & (
  | { kind: 'tx'; tx: Transaction }
  | { kind: 'rec'; rec: Reconciliation }
);

/** On the same day, money comes in first, then income, then money goes out, then the bank balance. */
const RANK: Record<TransactionType, number> = { buy: 0, deposit: 0, contribution: 0, income: 1, sell: 2, withdraw: 2 };
const RECONCILIATION_RANK = 3;

function events(transactions: readonly Transaction[], reconciliations: readonly Reconciliation[]): Event[] {
  const list: Event[] = [
    ...transactions.map(tx => ({ kind: 'tx' as const, tx, date: tx.date, rank: RANK[tx.type], createdAt: tx.createdAt })),
    ...reconciliations.map(rec => ({ kind: 'rec' as const, rec, date: rec.date, rank: RECONCILIATION_RANK, createdAt: rec.createdAt })),
  ];
  return list.sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank || a.createdAt.localeCompare(b.createdAt));
}

const sum = (values: readonly Cents[]) => values.reduce((a, b) => a + b, 0);
const isIn = (type: TransactionType, ...types: TransactionType[]) => types.includes(type);

function finish(
  base: Omit<Valuation, 'costCents' | 'grossCents' | 'iofCents' | 'irCents' | 'netCents'>,
  totals: { costCents: Cents; grossCents: Cents; iofCents?: Cents; irCents?: Cents },
): Valuation {
  const iofCents = totals.iofCents ?? 0;
  const irCents = totals.irCents ?? 0;
  return { ...base, ...totals, iofCents, irCents, netCents: totals.grossCents - iofCents - irCents };
}

// ---------- Fixed income held by amount ----------

/**
 * Splits `total` centavos in proportion to `weights`, giving the leftover centavos to the largest
 * remainders, so the parts add up to the total exactly. Undefined when every weight is zero.
 */
export function splitCents(total: Cents, weights: readonly Dec[]): Cents[] | undefined {
  const sumOfWeights = weights.reduce((a, w) => a.plus(w), ZERO);
  if (!sumOfWeights.gt(0)) return undefined;
  const exact = weights.map(w => w.div(sumOfWeights).mul(total));
  const parts = exact.map(x => x.floor().toNumber());
  const order = exact.map((_, i) => i).sort((a, b) => exact[b]!.minus(parts[b]!).cmp(exact[a]!.minus(parts[a]!)));
  for (const i of order.slice(0, total - sum(parts))) parts[i] = parts[i]! + 1;
  return parts;
}

interface AmountLot {
  id: string;
  date: IsoDate;
  /** What is left of the amount applied. */
  principal: Cents;
  /** Product of the reconciliations since the lot was applied. */
  scale: Dec;
}

function valueByAmount(position: Position, list: Event[], market: Market, today: IsoDate): Valuation {
  const accrual: AccrualSource | undefined = accrualFor(position, market);
  const issues = new Set<ValuationIssue>();
  const maturity = position.maturityDate;
  // Nothing accrues after the maturity date.
  const until = (date: IsoDate) => (maturity && maturity < date ? maturity : date);
  let estimated = false;

  /** The lot's value in centavos, before rounding. */
  const exactOf = (lot: AmountLot, date: IsoDate): Dec => {
    const a = accrual?.factor(lot.date, until(date));
    if (!a) issues.add(accrual ? 'sem-historico' : 'sem-preco');
    if (a?.estimated) estimated = true;
    return new Dec(lot.principal).mul(a?.factor ?? ONE).mul(lot.scale);
  };
  const valueOf = (lot: AmountLot, date: IsoDate): Cents => exactOf(lot, date).toDecimalPlaces(0).toNumber();

  const lots: AmountLot[] = [];
  let incomeCents = 0;
  let realizedCents = 0;
  let lastReconciliation: Valuation['lastReconciliation'] = null;
  for (const e of list) {
    if (e.kind === 'rec') {
      const estimate = sum(lots.map(l => valueOf(l, e.date)));
      const exact = lots.map(l => exactOf(l, e.date));
      const shares = splitCents(e.rec.balanceCents, exact);
      if (shares) {
        // Each lot now holds its share of the bank balance, and keeps earning from there. A lot
        // left with nothing at the bank is gone.
        lots.forEach((lot, i) => {
          if (exact[i]!.gt(0)) lot.scale = lot.scale.mul(new Dec(shares[i]!).div(exact[i]!));
        });
        for (let i = lots.length - 1; i >= 0; i--) if (shares[i] === 0) lots.splice(i, 1);
      } else if (e.rec.balanceCents > 0) {
        // A balance with no deposits recorded counts as applied on that day.
        lots.push({ id: e.rec.id, date: e.date, principal: e.rec.balanceCents, scale: ONE });
      }
      lastReconciliation = { date: e.date, balanceCents: e.rec.balanceCents, differenceCents: e.rec.balanceCents - estimate };
      continue;
    }
    const { tx } = e;
    if (isIn(tx.type, 'buy', 'deposit')) {
      lots.push({ id: tx.id, date: tx.date, principal: tx.amountCents, scale: ONE });
    } else if (tx.type === 'income') {
      incomeCents += tx.amountCents;
    } else if (isIn(tx.type, 'sell', 'withdraw')) {
      // The oldest money leaves first, as banks do for income tax.
      let left = tx.amountCents;
      while (left > 0 && lots.length > 0) {
        const lot = lots[0]!;
        const value = valueOf(lot, tx.date);
        if (value <= left) {
          left -= value;
          realizedCents += value - lot.principal;
          lots.shift();
        } else {
          const remaining = toCents(reais(lot.principal).mul(new Dec(value - left).div(value)));
          realizedCents += left - (lot.principal - remaining);
          left = 0;
          if (remaining > 0) lot.principal = remaining;
          else lots.shift();
        }
      }
      if (left > 0) issues.add('saida-maior');
    }
  }

  if (maturity && maturity < today && lots.length > 0) issues.add('vencida');
  if (accrual && !market.hasHolidays) issues.add('sem-feriados');
  const lotValues: LotValue[] = lots.map(lot => {
    const grossCents = valueOf(lot, today);
    const days = daysBetween(lot.date, until(today));
    return { id: lot.id, date: lot.date, quantity: null, costCents: lot.principal, grossCents, days, ...fixedIncomeTax(position.instrumentType, grossCents - lot.principal, days) };
  });
  const series = position.indexer === 'CDI' ? market.cdi : position.indexer === 'SELIC' ? market.selic : null;
  return finish(
    {
      positionId: position.id,
      family: 'amount',
      quantity: null,
      taxEstimated: true,
      priced: Boolean(accrual) && !issues.has('sem-historico'),
      estimated,
      dataDate: series?.last ?? null,
      lots: lotValues,
      incomeCents,
      realizedCents,
      lastReconciliation,
      issues: [...issues],
      open: lots.length > 0,
    },
    {
      costCents: sum(lotValues.map(l => l.costCents)),
      grossCents: sum(lotValues.map(l => l.grossCents)),
      iofCents: sum(lotValues.map(l => l.iofCents)),
      irCents: sum(lotValues.map(l => l.irCents)),
    },
  );
}

// ---------- Tesouro Direto bonds, in units ----------

interface UnitLot {
  id: string;
  date: IsoDate;
  quantity: Dec;
  cost: Cents;
}

function valueBond(position: Position, list: Event[], market: Market, today: IsoDate): Valuation {
  const issues = new Set<ValuationIssue>();
  const lots: UnitLot[] = [];
  let incomeCents = 0;
  let realizedCents = 0;
  for (const e of list) {
    if (e.kind !== 'tx') continue;
    const { tx } = e;
    if (tx.type === 'income') {
      incomeCents += tx.amountCents;
      continue;
    }
    if (!isIn(tx.type, 'buy', 'deposit', 'sell', 'withdraw')) continue;
    if (!tx.quantity) {
      issues.add('sem-quantidade');
      continue;
    }
    if (isIn(tx.type, 'buy', 'deposit')) {
      lots.push({ id: tx.id, date: tx.date, quantity: dec(tx.quantity), cost: tx.amountCents + tx.feesCents });
      continue;
    }
    // Tesouro Direto sells the oldest units first.
    let left = dec(tx.quantity);
    let costOut = 0;
    while (left.gt(0) && lots.length > 0) {
      const lot = lots[0]!;
      const take = Dec.min(lot.quantity, left);
      const part = take.eq(lot.quantity) ? lot.cost : toCents(reais(lot.cost).mul(take).div(lot.quantity));
      costOut += part;
      lot.cost -= part;
      lot.quantity = lot.quantity.minus(take);
      left = left.minus(take);
      if (lot.quantity.isZero()) lots.shift();
    }
    if (left.gt(0)) issues.add('saida-maior');
    realizedCents += tx.amountCents - tx.feesCents - costOut;
  }

  const maturity = position.maturityDate;
  const bond = maturity ? market.bonds.get(bondKey(position.instrumentType, maturity)) : undefined;
  if (lots.length > 0) {
    if (maturity && maturity < today) issues.add('vencida');
    if (!bond) issues.add('sem-preco');
  }
  const lotValues: LotValue[] = lots.map(lot => {
    const grossCents = bond ? toCents(reais(bond.basePrice).mul(lot.quantity)) : lot.cost;
    const days = daysBetween(lot.date, today);
    return { id: lot.id, date: lot.date, quantity: lot.quantity, costCents: lot.cost, grossCents, days, ...fixedIncomeTax(position.instrumentType, grossCents - lot.cost, days) };
  });
  return finish(
    {
      positionId: position.id,
      family: 'bond',
      quantity: lots.reduce((q, l) => q.plus(l.quantity), ZERO),
      taxEstimated: true,
      priced: Boolean(bond) || lots.length === 0,
      estimated: false,
      dataDate: market.bondsAsOf,
      lots: lotValues,
      incomeCents,
      realizedCents,
      lastReconciliation: null,
      issues: [...issues],
      open: lots.length > 0,
    },
    {
      costCents: sum(lotValues.map(l => l.costCents)),
      grossCents: sum(lotValues.map(l => l.grossCents)),
      iofCents: sum(lotValues.map(l => l.iofCents)),
      irCents: sum(lotValues.map(l => l.irCents)),
    },
  );
}

// ---------- Stocks, FIIs, ETFs, BDRs and crypto, at average cost ----------

/** Unit price in reais from the market files, and the date of the data. */
export function marketPrice(position: Pick<Position, 'ticker' | 'instrumentType'>, market: Market): { price: Dec; date: IsoDate | null } | undefined {
  const ticker = position.ticker?.trim().toUpperCase();
  if (!ticker) return undefined;
  if (position.instrumentType === 'Cripto') {
    const price = market.crypto.get(ticker);
    return price ? { price: dec(price), date: market.cryptoAsOf } : undefined;
  }
  const item = market.b3.get(ticker);
  return item ? { price: reais(item.close).div(item.factor ?? 1), date: market.b3AsOf } : undefined;
}

function valueMarket(position: Position, list: Event[], market: Market): Valuation {
  const issues = new Set<ValuationIssue>();
  let quantity = ZERO;
  let cost: Cents = 0;
  let incomeCents = 0;
  let realizedCents = 0;
  for (const e of list) {
    if (e.kind !== 'tx') continue;
    const { tx } = e;
    if (tx.type === 'income') {
      incomeCents += tx.amountCents;
      continue;
    }
    if (!isIn(tx.type, 'buy', 'deposit', 'sell', 'withdraw')) continue;
    if (!tx.quantity) {
      issues.add('sem-quantidade');
      continue;
    }
    let q = dec(tx.quantity);
    if (isIn(tx.type, 'buy', 'deposit')) {
      quantity = quantity.plus(q);
      cost += tx.amountCents + tx.feesCents;
      continue;
    }
    if (q.gt(quantity)) {
      issues.add('saida-maior');
      q = quantity;
    }
    // Average cost: what leaves takes its share of the cost, and the average stays the same.
    const costOut = q.eq(quantity) ? cost : quantity.isZero() ? 0 : toCents(reais(cost).mul(q).div(quantity));
    quantity = quantity.minus(q);
    cost -= costOut;
    realizedCents += tx.amountCents - tx.feesCents - costOut;
  }

  const open = quantity.gt(0);
  const quote = open ? marketPrice(position, market) : undefined;
  if (open && !quote) issues.add('sem-preco');
  return finish(
    {
      positionId: position.id,
      family: 'market',
      quantity,
      taxEstimated: false,
      priced: !open || Boolean(quote),
      estimated: false,
      dataDate: quote?.date ?? null,
      lots: [],
      incomeCents,
      realizedCents,
      lastReconciliation: null,
      issues: [...issues],
      open,
    },
    { costCents: cost, grossCents: quote ? toCents(quote.price.mul(quantity)) : cost },
  );
}

/** Values one position on `today` from its own transactions and reconciliations. */
export function valuePosition(
  position: Position,
  transactions: readonly Transaction[],
  reconciliations: readonly Reconciliation[],
  market: Market,
  today: IsoDate,
): Valuation {
  const list = events(transactions, reconciliations);
  switch (instrumentFamily(position.instrumentType)) {
    case 'amount':
      return valueByAmount(position, list, market, today);
    case 'bond':
      return valueBond(position, list, market, today);
    case 'market':
      return valueMarket(position, list, market);
  }
}
