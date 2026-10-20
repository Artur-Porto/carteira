import type { ReactNode } from 'react';
import { db } from '../../data/instance';
import { deletePosition, deleteReconciliation } from '../../data/entries';
import { reais, toCents } from '../../domain/decimal';
import { ASSET_CLASS_LABELS, BUCKET_LABELS } from '../../domain/policy';
import { IR_EXEMPT, fixedIncomeIrPct } from '../../domain/tax';
import { marketPrice, type LotValue, type Valuation } from '../../domain/valuation';
import type { Position } from '../../domain/types';
import { ConfirmButton } from '../components/ConfirmButton';
import { ChevronIcon } from '../components/icons';
import { Money, Quantity } from '../discreet';
import { formatDate } from '../format';
import { decimalBr } from '../input';
import { INSTRUMENT_LABELS, ISSUE_TEXTS, TRANSACTION_LABELS } from '../labels';
import { usePortfolio } from '../hooks';
import { gainPct, positionDetails } from '../positionText';
import { goBack, hrefFor, positionHref } from '../routes';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Where the value comes from, so the owner knows how fresh it is. */
function dataNote(position: Position, v: Valuation): string | null {
  if (!v.open || !v.priced) return null;
  if (v.family === 'market') return v.dataDate ? `Fechamento de ${formatDate(v.dataDate)}.` : null;
  if (v.family === 'bond') return v.dataDate ? `Preço do Tesouro Direto de ${formatDate(v.dataDate)}.` : null;
  const series = position.indexer === 'CDI' ? 'CDI' : position.indexer === 'SELIC' ? 'Selic' : null;
  if (series && v.dataDate) {
    return `Estimado pelo ${series} publicado até ${formatDate(v.dataDate)}${v.estimated ? '; os dias seguintes repetem a última taxa' : ''}.`;
  }
  if (position.indexer === 'IPCA') return v.estimated ? 'Estimado; os meses sem IPCA publicado repetem o último.' : 'Estimado pelo IPCA publicado.';
  return 'Estimado pela taxa contratada.';
}

function LotRow({ lot, exempt }: { lot: LotValue; exempt: boolean }) {
  const ir = exempt ? 'isento de IR' : `IR de ${decimalBr(fixedIncomeIrPct(lot.days).toFixed())}%`;
  return (
    <li>
      <span>
        <span className="name">{formatDate(lot.date)}</span>
        <span className="muted small">
          {lot.days} dias · {ir}
          {lot.quantity && (
            <>
              {' · '}
              <Quantity value={lot.quantity.toFixed()} /> títulos
            </>
          )}
        </span>
      </span>
      <span className="amount">
        <Money cents={lot.grossCents} />
        <span className="muted small">
          aplicado <Money cents={lot.costCents} />
        </span>
      </span>
    </li>
  );
}

export function PositionDetail({ id }: { id: string }) {
  const p = usePortfolio();
  if (!p) return null;
  const position = p.positions.find(x => x.id === id);
  if (!position) {
    return (
      <section className="card">
        <p>Esta posição não existe mais.</p>
        <a href={hrefFor('carteira')}>Ir para a carteira</a>
      </section>
    );
  }
  const v = p.value.valuations.get(id)!;
  const movements = p.transactions.filter(t => t.positionId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const balances = p.reconciliations.filter(r => r.positionId === id).sort((a, b) => b.date.localeCompare(a.date));
  const exempt = IR_EXEMPT.value.includes(position.instrumentType);
  const quote = v.family === 'market' ? marketPrice(position, p.market) : undefined;
  const note = dataNote(position, v);
  const parent = position.bucket === 'reserva' ? hrefFor('reserva') : hrefFor('carteira');

  return (
    <>
      <section className="card" aria-labelledby="position-title">
        <h2 id="position-title">{position.name}</h2>
        <p className="muted small">
          {INSTRUMENT_LABELS[position.instrumentType]} · {ASSET_CLASS_LABELS[position.assetClass]} · {BUCKET_LABELS[position.bucket]}
        </p>
        <p className="muted small">{positionDetails(position, v, p.institutionName(position.institutionId))}</p>
        <p className="big">
          <Money cents={v.grossCents} />
        </p>
        <dl className="rows">
          {v.family === 'market' && v.quantity && (
            <>
              <Row label="Quantidade">
                <Quantity value={v.quantity.toFixed()} />
              </Row>
              {v.quantity.gt(0) && (
                <Row label="Preço médio">
                  <Money cents={toCents(reais(v.costCents).div(v.quantity))} />
                </Row>
              )}
              {quote && (
                <Row label="Cotação">
                  <Money cents={toCents(quote.price)} />
                </Row>
              )}
            </>
          )}
          <Row label="Valor aplicado">
            <Money cents={v.costCents} />
          </Row>
          {v.open && v.priced && (
            <Row label={v.family === 'market' ? 'Ganho' : 'Rendimento'}>
              <Money cents={v.grossCents - v.costCents} signed /> {gainPct(v)}
            </Row>
          )}
          {v.taxEstimated && v.iofCents > 0 && (
            <Row label="IOF estimado">
              <Money cents={v.iofCents} />
            </Row>
          )}
          {v.taxEstimated && (
            <Row label="IR estimado">
              <Money cents={v.irCents} />
            </Row>
          )}
          {v.taxEstimated && (
            <Row label="Líquido estimado">
              <Money cents={v.netCents} />
            </Row>
          )}
          {v.incomeCents !== 0 && (
            <Row label="Rendimentos recebidos">
              <Money cents={v.incomeCents} />
            </Row>
          )}
          {v.realizedCents !== 0 && (
            <Row label={v.family === 'amount' ? 'Rendimento já resgatado' : 'Ganho já realizado'}>
              <Money cents={v.realizedCents} signed />
            </Row>
          )}
        </dl>
        {note && <p className="muted small">{note}</p>}
        {v.family === 'market' && <p className="muted small">O IR de ações, FIIs, ETFs e cripto depende das vendas do mês, e aparece quando houver sugestão de venda.</p>}
        {v.lastReconciliation && (
          <p className="muted small">
            Saldo do banco informado em {formatDate(v.lastReconciliation.date)}, com diferença de{' '}
            <Money cents={v.lastReconciliation.differenceCents} signed /> sobre a estimativa.
          </p>
        )}
        {v.issues.map(issue => (
          <p key={issue} className="notice">
            {ISSUE_TEXTS[issue]}
          </p>
        ))}
      </section>

      <a className="button primary" href={positionHref(id, 'movimento')}>
        Registrar movimentação
      </a>
      {v.family === 'amount' && (
        <a className="button" href={positionHref(id, 'conciliar')}>
          Informar saldo do banco
        </a>
      )}
      <a className="button" href={positionHref(id, 'editar')}>
        Editar posição
      </a>

      {v.lots.length > 0 && (
        <section className="card" aria-labelledby="lots-title">
          <h2 id="lots-title">Lotes</h2>
          <p className="muted small">
            Cada aplicação paga IR conforme o próprio prazo.
            {v.family === 'amount' ? ' Os resgates saem das aplicações mais antigas.' : ' As vendas saem dos títulos mais antigos.'}
          </p>
          <ul className="rows">
            {v.lots.map(lot => (
              <LotRow key={lot.id} lot={lot} exempt={exempt} />
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="moves-title">
        <h2 id="moves-title">Movimentações</h2>
        {movements.length === 0 ? (
          <p className="muted">Nenhuma movimentação ainda.</p>
        ) : (
          <ul className="rows">
            {movements.map(tx => (
              <li key={tx.id}>
                <a className="row-link" href={positionHref(id, 'movimento', tx.id)}>
                  <span>
                    <span className="name">{TRANSACTION_LABELS[tx.type]}</span>
                    <span className="muted small">
                      {formatDate(tx.date)}
                      {tx.quantity && (
                        <>
                          {' · '}
                          <Quantity value={tx.quantity} />
                          {v.family === 'bond' ? ' títulos' : position.ticker ? ` × ${position.ticker}` : ''}
                        </>
                      )}
                      {tx.note && ` · ${tx.note}`}
                    </span>
                  </span>
                  <span className="amount">
                    <Money cents={tx.amountCents} />
                  </span>
                  <ChevronIcon />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {balances.length > 0 && (
        <section className="card" aria-labelledby="balances-title">
          <h2 id="balances-title">Saldos informados</h2>
          <ul className="rows">
            {balances.map(rec => (
              <li key={rec.id}>
                <span className="name">{formatDate(rec.date)}</span>
                <span className="amount">
                  <Money cents={rec.balanceCents} />
                </span>
                <ConfirmButton small label="Apagar" confirmLabel="Apagar este saldo" onConfirm={() => deleteReconciliation(db, rec.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="delete-title">
        <h2 id="delete-title">Excluir</h2>
        <p className="muted small">
          Apaga a posição e {movements.length === 1 ? 'a movimentação' : `as ${movements.length} movimentações`} dela. Os backups
          salvos não mudam.
        </p>
        <ConfirmButton
          label="Excluir posição"
          confirmLabel="Excluir de vez"
          warning="A posição sai da carteira, com todas as movimentações."
          onConfirm={async () => {
            await deletePosition(db, id);
            goBack(parent);
          }}
        />
      </section>
    </>
  );
}
