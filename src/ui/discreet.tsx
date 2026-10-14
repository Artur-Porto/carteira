import { createContext, useContext } from 'react';
import type { Cents } from '../domain/types';
import { formatCents } from './format';

/** Discreet mode hides every amount with one tap (SPEC, privacy rule 7). */
export const DiscreetContext = createContext(false);

export function Money({ cents }: { cents: Cents }) {
  const hidden = useContext(DiscreetContext);
  if (hidden) {
    return (
      <span className="money" aria-label="valor oculto">
        R$ •••••
      </span>
    );
  }
  return <span className="money">{formatCents(cents)}</span>;
}
