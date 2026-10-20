import { useState } from 'react';
import { institutionFor, savePosition, setMonthlyCost } from '../../data/entries';
import { db } from '../../data/instance';
import { CheckField, NumberField, TextField } from '../components/fields';
import { Money } from '../discreet';
import { formatCents } from '../format';
import { readCents, readDecimal } from '../input';
import { usePortfolio } from '../hooks';
import { rateText } from '../positionText';
import { guideHref, hrefFor } from '../routes';

const STEPS = ['Custo de vida', 'Reserva', 'Previdência'] as const;

/**
 * SPEC, "Telas": on the first launch a short guide asks for the monthly cost, the reserve balances
 * and the pension plan. Every step can be skipped and done later on its own screen.
 */
export function Onboarding({ step }: { step: number }) {
  const p = usePortfolio();
  const [cost, setCost] = useState('');
  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [fgc, setFgc] = useState(true);
  const [rate, setRate] = useState('100');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const next = () => {
    setError(null);
    window.location.hash = guideHref(step + 1);
  };
  const reserve = p.positions.filter(pos => pos.bucket === 'reserva');

  async function saveCost() {
    const cents = readCents(cost);
    if (cents === null || cents <= 0) return setError('Informe quanto custa o seu mês, como 6.000,00.');
    await setMonthlyCost(db, cents);
    next();
  }

  async function addReserve() {
    const cents = readCents(balance);
    const pct = readDecimal(rate, 4);
    if (!name.trim()) return setError('Dê um nome, como "Cofrinho do banco".');
    if (pct === null || Number(pct) <= 0) return setError('Informe quanto do CDI rende, como 100.');
    if (cents === null || cents <= 0) return setError('Informe o saldo de hoje, como 15.000,00.');
    setBusy(true);
    try {
      const institutionId = await institutionFor(db, bank, fgc);
      await savePosition(
        db,
        {
          bucket: 'reserva',
          assetClass: 'rfPosFixada',
          instrumentType: 'CDB',
          name: name.trim(),
          institutionId,
          indexer: 'CDI',
          rate: pct,
          startDate: p!.today,
          maturityDate: null,
          liquidity: 'diaria',
          ticker: null,
        },
        { date: p!.today, type: 'deposit', amountCents: cents, quantity: null, feesCents: 0, note: 'Saldo informado nos primeiros passos' },
      );
      setName('');
      setBank('');
      setBalance('');
      setRate('100');
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ol className="steps" aria-label="Etapas">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined}>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form
          className="card form"
          onSubmit={e => {
            e.preventDefault();
            void saveCost();
          }}
        >
          <h2>Quanto custa o seu mês?</h2>
          <p className="muted small">A meta da reserva é de 12 meses desse custo. Some as despesas fixas e as variáveis de um mês comum.</p>
          <NumberField
            label="Custo de vida mensal"
            value={cost}
            onChange={setCost}
            placeholder="0,00"
            hint={readCents(cost) ? `Lido como ${formatCents(readCents(cost)!)}.` : undefined}
            error={error}
          />
          <button type="submit" className="button primary">
            Continuar
          </button>
          <button type="button" className="button" onClick={next}>
            Pular
          </button>
        </form>
      )}

      {step === 1 && (
        <section className="card form" aria-labelledby="guide-reserve">
          <h2 id="guide-reserve">Onde está a sua reserva?</h2>
          <p className="muted small">
            Cofrinhos, caixinhas e CDBs com liquidez diária. Informe o saldo de hoje: o app passa a estimar o rendimento pelo
            CDI. Tesouro Selic e outros tipos entram depois, em Reserva.
          </p>
          {reserve.length > 0 && (
            <ul className="rows">
              {reserve.map(pos => (
                <li key={pos.id}>
                  <span>
                    <span className="name">{pos.name}</span>
                    <span className="muted small">{rateText(pos)}</span>
                  </span>
                  <Money cents={p.value.valuations.get(pos.id)?.grossCents ?? 0} />
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={e => {
              e.preventDefault();
              void addReserve();
            }}
          >
            <TextField label="Nome" value={name} onChange={setName} placeholder="Cofrinho do banco" />
            <TextField label="Banco" value={bank} onChange={setBank} autoComplete="off" />
            <CheckField label="Coberto pelo FGC" checked={fgc} onChange={setFgc} />
            <NumberField label="Percentual do CDI" value={rate} onChange={setRate} />
            <NumberField
              label="Saldo de hoje"
              value={balance}
              onChange={setBalance}
              placeholder="0,00"
              hint={readCents(balance) ? `Lido como ${formatCents(readCents(balance)!)}.` : undefined}
              error={error}
            />
            <button type="submit" className="button" disabled={busy}>
              Adicionar à reserva
            </button>
          </form>
          <button type="button" className="button primary" onClick={next}>
            {reserve.length > 0 ? 'Continuar' : 'Pular'}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="card form" aria-labelledby="guide-pension">
          <h2 id="guide-pension">Previdência da empresa</h2>
          {p.pensionPlans.length > 0 ? (
            <p>Plano cadastrado: {p.pensionPlans.map(plan => plan.name).join(', ')}.</p>
          ) : (
            <p className="muted small">Com o PGBL da empresa, o app mostra quanto do saldo já é seu e quando vem o próximo degrau da carência.</p>
          )}
          <a className="button" href="#/previdencia/plano">
            {p.pensionPlans.length > 0 ? 'Cadastrar outro plano' : 'Cadastrar o plano'}
          </a>
          <a className="button primary" href={hrefFor('inicio')}>
            Concluir
          </a>
        </section>
      )}
    </>
  );
}
