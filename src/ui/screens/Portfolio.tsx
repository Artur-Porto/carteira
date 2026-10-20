import { ASSET_CLASS_LABELS, BUCKET_LABELS } from '../../domain/policy';
import { ASSET_CLASSES, BUCKETS, type Position } from '../../domain/types';
import type { Valuation } from '../../domain/valuation';
import { ChevronIcon } from '../components/icons';
import { Money } from '../discreet';
import { usePortfolio } from '../hooks';
import { gainPct, positionDetails } from '../positionText';
import { positionHref } from '../routes';

export function PositionRow({ position, valuation, institution }: { position: Position; valuation: Valuation | undefined; institution: string | null }) {
  const gain = valuation && valuation.open ? valuation.grossCents - valuation.costCents : 0;
  return (
    <li>
      <a className="row-link" href={positionHref(position.id)}>
        <span>
          <span className="name">{position.name}</span>
          <span className="muted small">{positionDetails(position, valuation, institution)}</span>
          {valuation && !valuation.priced && <span className="small tag">sem preço: valor aplicado</span>}
        </span>
        <span className="amount">
          <Money cents={valuation?.grossCents ?? 0} />
          {valuation && valuation.open && valuation.priced && valuation.costCents > 0 && (
            <span className="muted small">
              <Money cents={gain} signed /> {gainPct(valuation)}
            </span>
          )}
        </span>
        <ChevronIcon />
      </a>
    </li>
  );
}

export function Portfolio() {
  const p = usePortfolio();
  if (!p) return null;
  const { positions, value, institutionName } = p;
  const isOpen = (pos: Position) => {
    const v = value.valuations.get(pos.id);
    // A position with no movement yet still shows, so it can get one.
    return !v || v.open || !p.transactions.some(t => t.positionId === pos.id);
  };
  const open = positions.filter(isOpen);
  const closed = positions.filter(pos => !isOpen(pos));

  if (positions.length === 0) {
    return (
      <section className="card">
        <p>Nenhuma posição ainda.</p>
        <a className="button primary" href="#/carteira/nova">
          Adicionar posição
        </a>
        <p className="muted">A importação de planilha chega no marco 5.</p>
      </section>
    );
  }

  return (
    <>
      <a className="button primary" href="#/carteira/nova">
        Adicionar posição
      </a>
      {BUCKETS.map(bucket => {
        const inBucket = open.filter(pos => pos.bucket === bucket);
        if (inBucket.length === 0) return null;
        const totals = bucket === 'reserva' ? value.reserve : value.free;
        return (
          <section key={bucket} className="card" aria-labelledby={`bucket-${bucket}`}>
            <h2 id={`bucket-${bucket}`} className="split">
              <span>{BUCKET_LABELS[bucket]}</span>
              <Money cents={totals.grossCents} />
            </h2>
            {ASSET_CLASSES.map(cls => {
              const items = inBucket.filter(pos => pos.assetClass === cls);
              if (items.length === 0) return null;
              return (
                <div key={cls}>
                  <h3>{ASSET_CLASS_LABELS[cls]}</h3>
                  <ul className="rows">
                    {items.map(pos => (
                      <PositionRow key={pos.id} position={pos} valuation={value.valuations.get(pos.id)} institution={institutionName(pos.institutionId)} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}
      {closed.length > 0 && (
        <details className="card">
          <summary>Encerradas ({closed.length})</summary>
          <ul className="rows">
            {closed.map(pos => (
              <PositionRow key={pos.id} position={pos} valuation={value.valuations.get(pos.id)} institution={institutionName(pos.institutionId)} />
            ))}
          </ul>
        </details>
      )}
      <p className="muted small">Valores brutos de hoje, antes do IR. O ganho compara com o valor aplicado.</p>
    </>
  );
}
