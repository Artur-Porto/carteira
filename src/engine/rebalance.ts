// Rebalancing (SPEC, "Rebalanceamento"): a class outside its band is corrected first by the
// contributions; a sale is suggested only when the contributions would not correct it within 6
// months. Every sale shows its estimated tax, and for stocks the month's sales against the
// exemption. Fixed income, which has a maturity, never enters a sale. Pure, in exact integers.
import { Dec } from '../domain/decimal';
import { CRYPTO_GAIN, MARKET_GAIN_KINDS, STOCK_GAIN, marketGainTax, marketTaxKind, type MarketTaxKind } from '../domain/tax';
import { ASSET_CLASSES, instrumentFamily, type AssetClass, type Band, type Cents, type IsoDate, type Position, type Transaction } from '../domain/types';
import type { Valuation } from '../domain/valuation';
import { bandStatus, hundredths } from './allocation';

/** SPEC: a sale only when the contributions would take longer than this. */
export const CORRECTION_MONTHS = 6;

export interface SaleChunk {
  positionId: string;
  name: string;
  kind: MarketTaxKind;
  amountCents: Cents;
  /** Average cost of what leaves. */
  costCents: Cents;
  gainCents: Cents;
}

export interface SaleSuggestion {
  amountCents: Cents;
  chunks: SaleChunk[];
  taxCents: Cents;
  /** Stock and crypto sales of the month, before and with this sale, against their exemptions. */
  monthSales: { kind: 'acao' | 'cripto'; soFarCents: Cents; withSaleCents: Cents; exemptCents: Cents }[];
}

export interface ClassCorrection {
  assetClass: AssetClass;
  status: 'abaixo' | 'acima';
  valueCents: Cents;
  band: Band;
  /** Months of the planned contribution that bring the class back into its band; null without one. */
  months: number | null;
  fixedIncome: boolean;
  /** For a class above its band that the contributions do not correct in time. */
  sale: SaleSuggestion | null;
  /** Fixed income above its band: what is left behind by redeeming the sale amount early. */
  redeemCostCents: Cents | null;
}

export interface RebalanceInput {
  byClass: Record<AssetClass, Cents>;
  targets: Record<AssetClass, number>;
  bands: Record<AssetClass, Band>;
  monthlyContributionCents: Cents;
  positions: readonly Position[];
  valuations: ReadonlyMap<string, Valuation>;
  transactions: readonly Transaction[];
  today: IsoDate;
}

const FIXED_INCOME: readonly AssetClass[] = ['rfPosFixada', 'rfIpcaCurta', 'rfPrefixada', 'rfIpcaLonga'];
const ceilDiv = (a: bigint, b: bigint) => (a <= 0n ? 0n : (a + b - 1n) / b);

/** Contributions of `c` a month, none to this class, until value / (total + n·c) is within `max`. */
function monthsDown(v: bigint, total: bigint, maxH: bigint, c: bigint): number | null {
  if (v * 10_000n <= maxH * total) return 0;
  if (c <= 0n || maxH <= 0n) return null;
  return Number(ceilDiv(v * 10_000n - maxH * total, maxH * c));
}

/** Contributions of `c` a month, all to this class, until it reaches `min` of the total. */
function monthsUp(v: bigint, total: bigint, minH: bigint, c: bigint): number | null {
  if (v * 10_000n >= minH * total) return 0;
  if (c <= 0n || minH >= 10_000n) return null;
  const needed = ceilDiv(minH * total - 10_000n * v, 10_000n - minH);
  return Number(ceilDiv(needed, c));
}

/** This month's gross sales of stocks and of crypto, which decide their exemptions. */
export function monthSales(positions: readonly Position[], transactions: readonly Transaction[], today: IsoDate): Record<'acao' | 'cripto', Cents> {
  const kindOf = new Map(positions.map(p => [p.id, marketTaxKind(p.instrumentType)]));
  const sales = { acao: 0, cripto: 0 };
  for (const t of transactions) {
    if (t.type !== 'sell' || !t.date.startsWith(today.slice(0, 7))) continue;
    const kind = kindOf.get(t.positionId ?? '');
    if (kind === 'acao' || kind === 'cripto') sales[kind] += t.amountCents;
  }
  return sales;
}

/** What to sell in a class: the positions with the smallest gain first, so the tax stays low. */
function chunksFor(cls: AssetClass, amountCents: Cents, input: RebalanceInput): SaleChunk[] {
  const candidates = input.positions
    .flatMap(p => {
      const v = input.valuations.get(p.id);
      const kind = marketTaxKind(p.instrumentType);
      if (p.bucket !== 'livre' || p.assetClass !== cls || !kind || !v?.open || !v.priced || v.grossCents <= 0) return [];
      return [{ p, v, kind, gain: new Dec(v.grossCents - v.costCents).div(v.grossCents) }];
    })
    .sort((a, b) => a.gain.cmp(b.gain) || a.p.name.localeCompare(b.p.name, 'pt-BR'));
  const chunks: SaleChunk[] = [];
  let left = amountCents;
  for (const { p, v, kind } of candidates) {
    if (left <= 0) break;
    const amount = Math.min(left, v.grossCents);
    const cost = Number((BigInt(v.costCents) * BigInt(amount) + BigInt(v.grossCents) / 2n) / BigInt(v.grossCents));
    chunks.push({ positionId: p.id, name: p.ticker ?? p.name, kind, amountCents: amount, costCents: cost, gainCents: amount - cost });
    left -= amount;
  }
  return chunks;
}

export function rebalance(input: RebalanceInput): ClassCorrection[] {
  const total = ASSET_CLASSES.reduce((sum, cls) => sum + input.byClass[cls], 0);
  if (total <= 0) return [];
  const T = BigInt(total);
  const c = BigInt(Math.max(0, input.monthlyContributionCents));
  const corrections: ClassCorrection[] = [];
  for (const cls of ASSET_CLASSES) {
    const status = bandStatus(input.byClass[cls], total, input.bands[cls]);
    if (status === 'dentro') continue;
    const v = BigInt(input.byClass[cls]);
    const fixedIncome = FIXED_INCOME.includes(cls);
    const months = status === 'acima' ? monthsDown(v, T, hundredths(input.bands[cls].max), c) : monthsUp(v, T, hundredths(input.bands[cls].min), c);
    const late = status === 'acima' && c > 0n && (months === null || months > CORRECTION_MONTHS);
    // The smallest sale after which 6 months of contributions finish the job; the proceeds stay in
    // the free portfolio, so its total does not change.
    const saleCents = late ? Number(ceilDiv(v * 10_000n - hundredths(input.bands[cls].max) * (T + BigInt(CORRECTION_MONTHS) * c), 10_000n)) : 0;
    let redeemCostCents: Cents | null = null;
    let chunks: SaleChunk[] = [];
    if (late && fixedIncome) {
      const held = input.positions.filter(p => p.bucket === 'livre' && p.assetClass === cls && instrumentFamily(p.instrumentType) !== 'market');
      const gross = held.reduce((sum, p) => sum + (input.valuations.get(p.id)?.grossCents ?? 0), 0);
      const taxes = held.reduce((sum, p) => sum + (input.valuations.get(p.id)?.grossCents ?? 0) - (input.valuations.get(p.id)?.netCents ?? 0), 0);
      redeemCostCents = gross > 0 ? Math.round((taxes * saleCents) / gross) : 0;
    } else if (late) {
      chunks = chunksFor(cls, saleCents, input);
    }
    corrections.push({
      assetClass: cls,
      status,
      valueCents: input.byClass[cls],
      band: input.bands[cls],
      months,
      fixedIncome,
      sale: chunks.length > 0 ? { amountCents: chunks.reduce((s, ch) => s + ch.amountCents, 0), chunks, taxCents: 0, monthSales: [] } : null,
      redeemCostCents,
    });
  }
  return withTaxes(corrections, input);
}

/** Taxes of every suggested sale together, since the exemptions count the month's whole sales. */
function withTaxes(corrections: ClassCorrection[], input: RebalanceInput): ClassCorrection[] {
  const soFar = monthSales(input.positions, input.transactions, input.today);
  const all = corrections.flatMap(c => c.sale?.chunks ?? []);
  const sold = (kind: MarketTaxKind) => all.filter(ch => ch.kind === kind).reduce((s, ch) => s + ch.amountCents, 0);
  const monthTotal = (kind: MarketTaxKind) => (kind === 'acao' || kind === 'cripto' ? soFar[kind] + sold(kind) : 0);
  return corrections.map(c => {
    if (!c.sale) return c;
    const kinds = MARKET_GAIN_KINDS.filter(kind => c.sale!.chunks.some(ch => ch.kind === kind));
    const taxCents = kinds.reduce((sum, kind) => {
      const gain = c.sale!.chunks.filter(ch => ch.kind === kind).reduce((s, ch) => s + ch.gainCents, 0);
      return sum + marketGainTax(kind, gain, monthTotal(kind));
    }, 0);
    const monthSalesList = (['acao', 'cripto'] as const)
      .filter(kind => kinds.includes(kind))
      .map(kind => ({
        kind,
        soFarCents: soFar[kind],
        withSaleCents: monthTotal(kind),
        exemptCents: (kind === 'acao' ? STOCK_GAIN : CRYPTO_GAIN).value.monthlyExemptSalesCents,
      }));
    return { ...c, sale: { ...c.sale, taxCents, monthSales: monthSalesList } };
  });
}
