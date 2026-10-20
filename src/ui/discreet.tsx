import { createContext, useContext } from 'react';
import type { Cents } from '../domain/types';
import { formatCents } from './format';
import { decimalBr } from './input';

/** Discreet mode hides every amount with one tap (SPEC, privacy rule 7). */
export const DiscreetContext = createContext(false);

/** An amount in reais; `signed` adds a plus sign to gains. */
export function Money({ cents, signed = false }: { cents: Cents; signed?: boolean }) {
  const hidden = useContext(DiscreetContext);
  if (hidden) {
    return (
      <span className="money" aria-label="valor oculto">
        R$ •••••
      </span>
    );
  }
  return <span className="money">{`${signed && cents > 0 ? '+' : ''}${formatCents(cents)}`}</span>;
}

/** A quantity of units, such as shares or bonds. It reveals wealth too, so it hides as well. */
export function Quantity({ value }: { value: string }) {
  const hidden = useContext(DiscreetContext);
  if (hidden) {
    return (
      <span className="money" aria-label="quantidade oculta">
        •••
      </span>
    );
  }
  return <span className="money">{decimalBr(value)}</span>;
}
