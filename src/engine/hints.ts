// Type of asset within a class (SPEC, "Aporte do mês", step 5): a vacant year in the medium-term
// ladder, issuers below the FGC limit, and assets already at their own limit. Pure.
import { Dec } from '../domain/decimal';
import { MEDIUM_TERM_CLASSES } from '../domain/policy';
import { FGC_GUARANTEE } from '../domain/tax';
import { ASSET_CLASSES, type AssetClass, type Cents, type Institution, type IsoDate, type Policy, type Position } from '../domain/types';
import type { Valuation } from '../domain/valuation';
import { hundredths } from './allocation';

export interface IssuerExposure {
  conglomerate: string;
  valueCents: Cents;
  /** The policy's share of the FGC guarantee (SPEC, "Limites": 80% per conglomerate). */
  limitCents: Cents;
}

export interface AssetShare {
  positionId: string;
  name: string;
  /** Percent of the free portfolio for a stock, or of the FII class for a FII. */
  pct: Dec;
}

export type Hint =
  /** No position in the class yet, so its indexer or kind is missing from the portfolio. */
  | { kind: 'vazia' }
  /** Years from 2 to 5 years ahead without a medium-term maturity. */
  | { kind: 'escada'; years: number[] }
  | { kind: 'emissores'; withRoom: IssuerExposure[]; full: IssuerExposure[] }
  | { kind: 'acoes'; over: AssetShare[]; maxPct: number }
  | { kind: 'fiis'; over: AssetShare[]; maxPct: number }
  | { kind: 'cripto'; roomCents: Cents; maxPct: number };

export interface Holdings {
  positions: readonly Position[];
  valuations: ReadonlyMap<string, Valuation>;
  institutions: readonly Institution[];
  policy: Policy;
  today: IsoDate;
}

const FIXED_INCOME: readonly AssetClass[] = ['rfPosFixada', 'rfIpcaCurta', 'rfPrefixada', 'rfIpcaLonga'];

function open(h: Holdings): { position: Position; valuation: Valuation }[] {
  return h.positions.flatMap(position => {
    const valuation = h.valuations.get(position.id);
    return valuation?.open ? [{ position, valuation }] : [];
  });
}

/** FGC-covered balances by conglomerate, the reserve included, since the guarantee is per person. */
export function issuerExposures(h: Holdings): IssuerExposure[] {
  const limitCents = Math.round((FGC_GUARANTEE.value.perConglomerateCents * h.policy.limits.issuerFgcPct) / 100);
  const totals = new Map<string, Cents>();
  for (const { position, valuation } of open(h)) {
    if (!FGC_GUARANTEE.value.instruments.includes(position.instrumentType)) continue;
    const institution = h.institutions.find(i => i.id === position.institutionId);
    if (!institution?.fgcCovered) continue;
    const name = institution.conglomerate.trim() || institution.name;
    totals.set(name, (totals.get(name) ?? 0) + valuation.grossCents);
  }
  return [...totals]
    .map(([conglomerate, valueCents]) => ({ conglomerate, valueCents, limitCents }))
    .sort((a, b) => b.valueCents - a.valueCents || a.conglomerate.localeCompare(b.conglomerate, 'pt-BR'));
}

/** SPEC, "Limites": medium-term maturities in a ladder, one a year; new rungs go 2 to 5 years ahead. */
export function vacantLadderYears(h: Holdings): number[] {
  const taken = new Set(
    open(h)
      .filter(({ position: p }) => p.bucket === 'livre' && MEDIUM_TERM_CLASSES.includes(p.assetClass) && p.maturityDate)
      .map(({ position: p }) => Number(p.maturityDate!.slice(0, 4))),
  );
  const year = Number(h.today.slice(0, 4));
  return [2, 3, 4, 5].map(n => year + n).filter(y => !taken.has(y));
}

/** Hints for a class, with the free portfolio as it will be after the contribution. */
export function classHints(cls: AssetClass, h: Holdings, afterByClass: Record<AssetClass, Cents>): Hint[] {
  const held = open(h).filter(({ position: p }) => p.bucket === 'livre' && p.assetClass === cls);
  const hints: Hint[] = held.length === 0 ? [{ kind: 'vazia' }] : [];
  const { limits } = h.policy;

  if (MEDIUM_TERM_CLASSES.includes(cls)) {
    const years = vacantLadderYears(h);
    if (years.length > 0) hints.push({ kind: 'escada', years });
  }
  if (FIXED_INCOME.includes(cls)) {
    const issuers = issuerExposures(h);
    if (issuers.length > 0) {
      hints.push({ kind: 'emissores', withRoom: issuers.filter(i => i.valueCents < i.limitCents), full: issuers.filter(i => i.valueCents >= i.limitCents) });
    }
  }
  if (cls === 'acoesBrasil') {
    const free = ASSET_CLASSES.reduce((sum, c) => sum + afterByClass[c], 0);
    const over = shares(held, 'Acao', free).filter(s => s.pct.gt(limits.singleStockMaxPct));
    if (over.length > 0) hints.push({ kind: 'acoes', over, maxPct: limits.singleStockMaxPct });
  }
  if (cls === 'fiis') {
    const over = shares(held, 'FII', afterByClass.fiis).filter(s => s.pct.gt(limits.singleFiiMaxPctOfClass));
    if (over.length > 0) hints.push({ kind: 'fiis', over, maxPct: limits.singleFiiMaxPctOfClass });
  }
  if (cls === 'cripto') {
    const free = ASSET_CLASSES.reduce((sum, c) => sum + afterByClass[c], 0);
    const cap = Number((BigInt(free) * hundredths(limits.criptoMaxPct)) / 10_000n);
    hints.push({ kind: 'cripto', roomCents: Math.max(0, cap - afterByClass.cripto), maxPct: limits.criptoMaxPct });
  }
  return hints;
}

function shares(held: { position: Position; valuation: Valuation }[], type: Position['instrumentType'], totalCents: Cents): AssetShare[] {
  if (totalCents <= 0) return [];
  return held
    .filter(({ position }) => position.instrumentType === type)
    .map(({ position, valuation }) => ({
      positionId: position.id,
      name: position.ticker ?? position.name,
      pct: new Dec(valuation.grossCents).mul(100).div(totalCents),
    }))
    .sort((a, b) => b.pct.cmp(a.pct));
}
