import { useState } from 'react';
import { deleteTransaction, saveTransaction } from '../../data/entries';
import { db } from '../../data/instance';
import type { InstrumentFamily, IsoDate, Position, Transaction, TransactionType } from '../../domain/types';
import { instrumentFamily } from '../../domain/types';
import type { Valuation } from '../../domain/valuation';
import { ConfirmButton } from '../components/ConfirmButton';
import { DateField, NumberField, SelectField, TextField } from '../components/fields';
import { Money } from '../discreet';
import { centsInput, decimalBr, readCents, readDecimal } from '../input';
import { TRANSACTION_LABELS } from '../labels';
import { usePortfolio } from '../hooks';
import { goBack, positionHref } from '../routes';
import { formatCents } from '../format';

/** Movements that make sense for each kind of position. */
const TYPES: Record<InstrumentFamily, readonly TransactionType[]> = {
  amount: ['deposit', 'withdraw', 'income'],
  bond: ['buy', 'sell', 'income'],
  market: ['buy', 'sell', 'income'],
};

function amountLabel(family: InstrumentFamily, type: TransactionType): string {
  if (type === 'income') return family === 'bond' ? 'Cupom recebido' : 'Valor recebido';
  if (family === 'amount') return type === 'deposit' ? 'Valor aplicado' : 'Valor resgatado, antes do IR';
  if (type === 'buy') return 'Valor pago, sem os custos';
  return 'Valor da venda, antes dos custos e do IR';
}

const needsQuantity = (family: InstrumentFamily, type: TransactionType) => family !== 'amount' && (type === 'buy' || type === 'sell');

function Editor({ position, existing, valuation, today }: { position: Position; existing: Transaction | undefined; valuation: Valuation | undefined; today: IsoDate }) {
  const family = instrumentFamily(position.instrumentType);
  const [type, setType] = useState<TransactionType>(existing?.type ?? TYPES[family][0]!);
  const [date, setDate] = useState(existing?.date ?? today);
  const [amount, setAmount] = useState(existing ? centsInput(existing.amountCents) : '');
  const [quantity, setQuantity] = useState(existing?.quantity?.replace('.', ',') ?? '');
  const [fees, setFees] = useState(existing && existing.feesCents ? centsInput(existing.feesCents) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const back = positionHref(position.id);
  const withQuantity = needsQuantity(family, type);
  const types = TYPES[family].includes(type) ? TYPES[family] : [...TYPES[family], type];

  async function submit() {
    const found: Record<string, string> = {};
    const cents = readCents(amount);
    const q = readDecimal(quantity, 8);
    const feeCents = fees ? readCents(fees) : 0;
    if (!date) found['date'] = 'Informe a data.';
    else if (date > today) found['date'] = 'A data não pode ser futura.';
    if (cents === null || cents <= 0) found['amount'] = 'Informe o valor, como 1.500,00.';
    if (withQuantity && (q === null || Number(q) <= 0)) found['quantity'] = 'Informe a quantidade.';
    if (feeCents === null || feeCents < 0) found['fees'] = 'Valor inválido.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await saveTransaction(db, {
        id: existing?.id,
        date,
        type,
        positionId: position.id,
        amountCents: cents!,
        quantity: withQuantity ? q : null,
        feesCents: family === 'amount' ? 0 : feeCents!,
        note: note.trim(),
      });
      goBack(back);
    } finally {
      setBusy(false);
    }
  }

  const parsed = readCents(amount);
  return (
    <form
      className="card form"
      onSubmit={e => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="muted">{position.name}</p>
      <SelectField label="Tipo" value={type} onChange={setType} options={types.map(t => [t, TRANSACTION_LABELS[t]] as const)} />
      <DateField label="Data" value={date} max={today} onChange={setDate} error={errors['date']} />
      {withQuantity && (
        <NumberField
          label={family === 'bond' ? 'Quantidade de títulos' : 'Quantidade'}
          value={quantity}
          onChange={setQuantity}
          hint={readDecimal(quantity, 8) ? `Lido como ${decimalBr(readDecimal(quantity, 8)!)}.` : undefined}
          error={errors['quantity']}
        />
      )}
      <NumberField
        label={amountLabel(family, type)}
        value={amount}
        onChange={setAmount}
        placeholder="0,00"
        hint={parsed !== null && parsed > 0 ? `Lido como ${formatCents(parsed)}.` : undefined}
        error={errors['amount']}
      />
      {family === 'amount' && type === 'withdraw' && valuation?.open && (
        <p className="muted small">
          Saldo estimado hoje: <Money cents={valuation.grossCents} />. O resgate sai das aplicações mais antigas.
        </p>
      )}
      {family !== 'amount' && type !== 'income' && (
        <NumberField label="Custos da operação (opcional)" value={fees} onChange={setFees} placeholder="0,00" error={errors['fees']} />
      )}
      <TextField label="Nota (opcional)" value={note} onChange={setNote} maxLength={200} />
      <button type="submit" className="button primary" disabled={busy}>
        {existing ? 'Salvar' : 'Registrar'}
      </button>
      <button type="button" className="button" onClick={() => goBack(back)}>
        Cancelar
      </button>
      {existing && (
        <ConfirmButton
          label="Apagar movimentação"
          confirmLabel="Apagar de vez"
          onConfirm={async () => {
            await deleteTransaction(db, existing.id);
            goBack(back);
          }}
        />
      )}
    </form>
  );
}

export function MovementForm({ positionId, transactionId }: { positionId: string; transactionId: string | null }) {
  const p = usePortfolio();
  if (!p) return null;
  const position = p.positions.find(x => x.id === positionId);
  const existing = transactionId ? p.transactions.find(t => t.id === transactionId) : undefined;
  if (!position || (transactionId && !existing)) return <p className="card">Esta movimentação não existe mais.</p>;
  return (
    <Editor key={transactionId ?? 'nova'} position={position} existing={existing} valuation={p.value.valuations.get(positionId)} today={p.today} />
  );
}
