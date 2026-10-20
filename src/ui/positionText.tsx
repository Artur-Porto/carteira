// How a position is described on screen.
import type { ReactNode } from 'react';
import type { Position } from '../domain/types';
import type { Valuation } from '../domain/valuation';
import { Quantity } from './discreet';
import { formatDate } from './format';
import { decimalBr } from './input';

/** The contracted rate in words, such as "110% do CDI" or "IPCA + 7,20% ao ano". */
export function rateText(p: Pick<Position, 'indexer' | 'rate'>): string | null {
  const rate = p.rate === null ? null : decimalBr(p.rate);
  switch (p.indexer) {
    case 'CDI':
      return `${rate ?? '100'}% do CDI`;
    case 'SELIC':
      return rate && rate !== '0' ? `Selic + ${rate}% ao ano` : 'Selic';
    case 'IPCA':
      return rate ? `IPCA + ${rate}% ao ano` : 'IPCA';
    case 'PRE':
      return rate ? `${rate}% ao ano` : 'Prefixado';
    case null:
      return null;
  }
}

/** One line under the position's name: units or rate, institution and maturity. */
export function positionDetails(p: Position, v: Valuation | undefined, institution: string | null): ReactNode {
  const parts: ReactNode[] = [];
  if (v?.family === 'market' && v.quantity && p.ticker) {
    parts.push(
      <span key="q">
        <Quantity value={v.quantity.toFixed()} /> × {p.ticker}
      </span>,
    );
  } else if (v?.family === 'bond' && v.quantity?.gt(0)) {
    parts.push(
      <span key="q">
        <Quantity value={v.quantity.toFixed()} /> {v.quantity.eq(1) ? 'título' : 'títulos'}
      </span>,
    );
  } else if (v?.family !== 'bond') {
    const rate = rateText(p);
    if (rate) parts.push(rate);
  }
  if (institution) parts.push(institution);
  if (p.maturityDate) parts.push(`vence em ${formatDate(p.maturityDate)}`);
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 && ' · '}
      {part}
    </span>
  ));
}

/** Gain over the cost, in percent with one decimal; null when nothing was applied. */
export function gainPct(v: Pick<Valuation, 'grossCents' | 'costCents'>): string | null {
  if (v.costCents <= 0) return null;
  const pct = ((v.grossCents - v.costCents) / v.costCents) * 100;
  return `${pct > 0 ? '+' : ''}${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
