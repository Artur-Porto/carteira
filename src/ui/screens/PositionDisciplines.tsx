// Discipline on a variable-income position: its thesis (SPEC, "Formato de uma sugestão": each
// variable-income asset keeps its thesis) and the 72-hour wait before a sale outside the plan.
import { useState } from 'react';
import { deleteThesis, saveDecisionLog, saveThesis, setSaleIntentOutcome } from '../../data/entries';
import { db } from '../../data/instance';
import type { DecisionLog, IsoDate, Position, Thesis } from '../../domain/types';
import { SALE_WAIT_MS, intentionReady } from '../../engine/alerts';
import { ConfirmButton } from '../components/ConfirmButton';
import { DateField, TextField } from '../components/fields';
import { formatDate, formatDateTime } from '../format';
import { positionHref } from '../routes';

export function ThesisCard({ position, thesis, today }: { position: Position; thesis: Thesis | undefined; today: IsoDate }) {
  const [editing, setEditing] = useState(!thesis);
  const [text, setText] = useState(thesis?.text ?? '');
  const [review, setReview] = useState(thesis?.reviewDate ?? '');
  return (
    <section className="card" aria-labelledby="thesis-title">
      <h2 id="thesis-title">Tese</h2>
      {thesis && !editing ? (
        <>
          <p>{thesis.text}</p>
          {thesis.reviewDate && <p className="muted small">Revisar em {formatDate(thesis.reviewDate)}.</p>}
          <button type="button" className="button" onClick={() => setEditing(true)}>
            Editar a tese
          </button>
          <ConfirmButton label="Apagar a tese" confirmLabel="Apagar de vez" onConfirm={() => deleteThesis(db, thesis.id)} />
        </>
      ) : (
        <form
          onSubmit={async e => {
            e.preventDefault();
            if (!text.trim()) return;
            await saveThesis(db, { positionId: position.id, text: text.trim(), reviewDate: review || null });
            setEditing(false);
          }}
        >
          <TextField label="Por que este ativo, em até três frases" value={text} onChange={setText} maxLength={1000} />
          <DateField label="Revisar a tese em (opcional)" value={review} min={today} onChange={setReview} />
          <button type="submit" className="button" disabled={!text.trim()}>
            Salvar a tese
          </button>
        </form>
      )}
    </section>
  );
}

export function SaleIntentCard({ position, logs, today, now }: { position: Position; logs: readonly DecisionLog[]; today: IsoDate; now: Date }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [change, setChange] = useState('');
  const pending = logs.find(d => d.saleIntent?.outcome === 'pendente' && d.relatedIds.includes(position.id));

  let body;
  if (pending) {
    const until = new Date(Date.parse(pending.createdAt) + SALE_WAIT_MS).toISOString();
    body = intentionReady(pending, now) ? (
      <>
        <p>A espera de 72 horas terminou. Motivo anotado: {pending.reason}</p>
        <p className="muted small">Se ainda fizer sentido, venda na corretora e registre a venda. Se mudou de ideia, desista: a decisão fica no diário.</p>
        <a className="button primary" href={positionHref(position.id, 'movimento')}>
          Registrar a venda
        </a>
        <button type="button" className="button" onClick={() => void setSaleIntentOutcome(db, pending.id, 'desistiu')}>
          Desistir da venda
        </button>
      </>
    ) : (
      <>
        <p>Intenção de vender anotada em {formatDateTime(pending.createdAt)}.</p>
        <p className="muted small">A política pede 72 horas de espera numa venda fora do plano. Volte depois de {formatDateTime(until)}.</p>
        <button type="button" className="button" onClick={() => void setSaleIntentOutcome(db, pending.id, 'desistiu')}>
          Desistir da venda
        </button>
      </>
    );
  } else if (asking) {
    body = (
      <form
        onSubmit={async e => {
          e.preventDefault();
          if (!reason.trim()) return;
          await saveDecisionLog(db, {
            date: today,
            type: 'venda',
            reason: reason.trim(),
            wouldChangeIf: change.trim(),
            relatedIds: [position.id],
            saleIntent: { outcome: 'pendente' },
          });
          setAsking(false);
        }}
      >
        <TextField label="Por que vender" value={reason} onChange={setReason} maxLength={2000} />
        <TextField label="O que faria você mudar de ideia" value={change} onChange={setChange} maxLength={2000} />
        <button type="submit" className="button" disabled={!reason.trim()}>
          Anotar e esperar 72 horas
        </button>
      </form>
    );
  } else {
    body = (
      <>
        <p className="muted small">Uma venda fora do plano de rebalanceamento passa por 72 horas de espera: o app guarda o motivo e pergunta de novo depois.</p>
        <button type="button" className="button" onClick={() => setAsking(true)}>
          Quero vender
        </button>
      </>
    );
  }
  return (
    <section className="card" aria-labelledby="sale-title">
      <h2 id="sale-title">Pensando em vender</h2>
      {body}
    </section>
  );
}
