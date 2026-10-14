import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/instance';
import { ASSET_CLASS_LABELS, BUCKET_LABELS } from '../../domain/policy';
import { ASSET_CLASSES, BUCKETS, type Position } from '../../domain/types';
import { Money } from '../discreet';
import { formatDate } from '../format';

function details(p: Position, institutions: Map<string, string>): string {
  const quantity = p.quantity?.replace('.', ',');
  return [
    p.ticker && quantity ? `${quantity} × ${p.ticker}` : p.ticker,
    p.institutionId ? institutions.get(p.institutionId) : null,
    p.maturityDate ? `vence em ${formatDate(p.maturityDate)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function Portfolio() {
  const data = useLiveQuery(async () => {
    const [positions, institutions] = await Promise.all([db.positions.toArray(), db.institutions.toArray()]);
    return { positions, institutions: new Map(institutions.map(i => [i.id, i.name])) };
  });
  if (!data) return null;

  if (data.positions.length === 0) {
    return (
      <section className="card">
        <p>Nenhuma posição ainda.</p>
        <p className="muted">O lançamento manual chega no marco 2, e a importação de planilha, no marco 5.</p>
      </section>
    );
  }

  return (
    <>
      {BUCKETS.map(bucket => {
        const inBucket = data.positions.filter(p => p.bucket === bucket);
        if (inBucket.length === 0) return null;
        return (
          <section key={bucket} className="card">
            <h2>{BUCKET_LABELS[bucket]}</h2>
            {ASSET_CLASSES.map(cls => {
              const items = inBucket.filter(p => p.assetClass === cls);
              if (items.length === 0) return null;
              return (
                <div key={cls}>
                  <h3>{ASSET_CLASS_LABELS[cls]}</h3>
                  <ul className="rows">
                    {items.map(p => (
                      <li key={p.id}>
                        <span>
                          <span className="name">{p.name}</span>
                          <span className="muted small">{details(p, data.institutions)}</span>
                        </span>
                        <Money cents={p.costBasisCents} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}
      <p className="muted">Valores pelo preço de compra. O lançamento manual e os preços de mercado chegam no marco 2.</p>
    </>
  );
}
