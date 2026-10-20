import { useState } from 'react';
import { saveReconciliation } from '../../data/entries';
import { db } from '../../data/instance';
import type { IsoDate, Position } from '../../domain/types';
import { valuePosition } from '../../domain/valuation';
import { DateField, NumberField } from '../components/fields';
import { Money } from '../discreet';
import { formatCents } from '../format';
import { readCents } from '../input';
import { usePortfolio } from '../hooks';
import { goBack, positionHref } from '../routes';

/** Above this, the difference is more likely a movement left out than a rounding. */
const LARGE_DIFFERENCE = 0.02;

/**
 * SPEC, "Rendimento da reserva": the owner types the bank's balance and the app records the
 * difference. From that date on the estimate follows the bank.
 */
export function ReconcileForm({ positionId }: { positionId: string }) {
  const p = usePortfolio();
  const [date, setDate] = useState<IsoDate | null>(null);
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const position: Position | undefined = p.positions.find(x => x.id === positionId);
  if (!position) return <p className="card">Esta posição não existe mais.</p>;
  const on = date ?? p.today;
  const back = positionHref(positionId);

  // The estimate on the chosen date, from the movements up to it and the earlier balances.
  const movements = p.transactions.filter(t => t.positionId === positionId && t.date <= on);
  const earlier = p.reconciliations.filter(r => r.positionId === positionId && r.date < on);
  const estimate = valuePosition(position, movements, earlier, p.market, on).grossCents;
  const cents = readCents(balance);
  const difference = cents === null ? null : cents - estimate;
  const large = difference !== null && estimate > 0 && Math.abs(difference) / estimate > LARGE_DIFFERENCE;

  async function submit() {
    if (on > p!.today) return setError('A data não pode ser futura.');
    if (cents === null || cents < 0) return setError('Informe o saldo, como 30.450,12.');
    setBusy(true);
    try {
      await saveReconciliation(db, { positionId, date: on, balanceCents: cents });
      goBack(back);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card form"
      onSubmit={e => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="muted">{position.name}</p>
      <p className="small">
        Informe o saldo bruto que o banco mostra, antes do IR. A partir dessa data, a estimativa segue o banco e reparte a
        diferença entre as aplicações.
      </p>
      <DateField label="Data do saldo" value={on} max={p.today} onChange={setDate} />
      <p className="muted small">
        Estimativa do app nessa data: <Money cents={estimate} />
      </p>
      <NumberField
        label="Saldo no banco"
        value={balance}
        onChange={v => {
          setBalance(v);
          setError(null);
        }}
        placeholder="0,00"
        hint={cents !== null ? `Lido como ${formatCents(cents)}.` : undefined}
        error={error}
      />
      {difference !== null && (
        <p className="small">
          Diferença: <Money cents={difference} signed />
        </p>
      )}
      {large && (
        <p className="notice">A diferença passa de 2%. Confira se falta registrar alguma aplicação ou resgate antes de salvar.</p>
      )}
      <button type="submit" className="button primary" disabled={busy}>
        Salvar saldo
      </button>
      <button type="button" className="button" onClick={() => goBack(back)}>
        Cancelar
      </button>
    </form>
  );
}
