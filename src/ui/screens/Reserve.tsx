import { useState } from 'react';
import { setMonthlyCost } from '../../data/entries';
import { db } from '../../data/instance';
import { dec } from '../../domain/decimal';
import { reserveMonths } from '../../domain/portfolio';
import type { Cents, Position } from '../../domain/types';
import { NumberField } from '../components/fields';
import { Money } from '../discreet';
import { formatCents } from '../format';
import { centsInput, readCents } from '../input';
import { usePortfolio } from '../hooks';
import { PositionRow } from './Portfolio';

/** SPEC, "Reserva": below the floor of 100% of the CDI, the app warns. */
function belowFloor(p: Position, minCdiPct: number): boolean {
  return p.indexer === 'CDI' && p.rate !== null && dec(p.rate).lt(minCdiPct);
}

function MonthlyCost({ cents }: { cents: Cents }) {
  const [editing, setEditing] = useState(cents === 0);
  const [text, setText] = useState(cents ? centsInput(cents) : '');
  const [error, setError] = useState<string | null>(null);
  if (!editing) {
    return (
      <p>
        Custo de vida mensal: <Money cents={cents} />{' '}
        <button type="button" className="link-button" onClick={() => setEditing(true)}>
          Alterar
        </button>
      </p>
    );
  }
  const parsed = readCents(text);
  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        if (parsed === null || parsed <= 0) return setError('Informe o custo do mês, como 6.000,00.');
        await setMonthlyCost(db, parsed);
        setEditing(false);
      }}
    >
      <NumberField
        label="Custo de vida mensal"
        value={text}
        onChange={v => {
          setText(v);
          setError(null);
        }}
        placeholder="0,00"
        hint={parsed !== null && parsed > 0 ? `Lido como ${formatCents(parsed)}. A meta da reserva é um múltiplo dele.` : 'A meta da reserva é um múltiplo dele.'}
        error={error}
      />
      <button type="submit" className="button primary">
        Salvar custo de vida
      </button>
    </form>
  );
}

export function Reserve() {
  const p = usePortfolio();
  if (!p) return null;
  const { value, policy, institutionName } = p;
  const monthlyCost = policy?.reserve.monthlyCostCents ?? 0;
  const targetMonths = policy?.reserve.months ?? 12;
  const minCdi = policy?.reserve.minCdiPct ?? 100;
  const months = reserveMonths(value.reserve.netCents, monthlyCost);
  const positions = p.positions.filter(pos => pos.bucket === 'reserva' && (value.valuations.get(pos.id)?.open ?? true));
  const low = positions.filter(pos => belowFloor(pos, minCdi));
  const gain = value.reserve.grossCents - value.reserve.costCents;

  return (
    <>
      <section className="card" aria-labelledby="reserve-total-title">
        <h2 id="reserve-total-title">Saldo estimado</h2>
        <p className="big">
          <Money cents={value.reserve.grossCents} />
        </p>
        <dl className="rows">
          <div>
            <dt>Aplicado</dt>
            <dd>
              <Money cents={value.reserve.costCents} />
            </dd>
          </div>
          <div>
            <dt>Rendimento</dt>
            <dd>
              <Money cents={gain} signed />
            </dd>
          </div>
          <div>
            <dt>Líquido, depois do IR</dt>
            <dd>
              <Money cents={value.reserve.netCents} />
            </dd>
          </div>
        </dl>
        {months !== null && (
          <p>
            <strong>{months.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} meses</strong> de custo de vida, para uma meta
            de {targetMonths} meses.
          </p>
        )}
        <MonthlyCost key={monthlyCost} cents={monthlyCost} />
        <p className="muted small">
          Cada aplicação rende o CDI diário vezes o percentual contratado, nos dias úteis, e paga IR conforme o próprio prazo.
          Informe o saldo do banco em cada posição para corrigir a estimativa.
        </p>
      </section>

      {low.length > 0 && (
        <p className="notice">
          {low.map(pos => pos.name).join(', ')} {low.length === 1 ? 'rende' : 'rendem'} abaixo de {minCdi}% do CDI, o piso da
          política para a reserva.
        </p>
      )}

      <section className="card" aria-labelledby="reserve-items-title">
        <h2 id="reserve-items-title">Onde está a reserva</h2>
        {positions.length === 0 ? (
          <p className="muted">Nenhuma posição na reserva ainda.</p>
        ) : (
          <ul className="rows">
            {positions.map(pos => (
              <PositionRow key={pos.id} position={pos} valuation={value.valuations.get(pos.id)} institution={institutionName(pos.institutionId)} />
            ))}
          </ul>
        )}
      </section>
      <a className="button primary" href="#/reserva/nova">
        Adicionar à reserva
      </a>
    </>
  );
}
