// SPEC, "Revisão mensal": the month's checklist, the decision diary and the theses of the assets.
import { useState, type ReactNode } from 'react';
import { deleteDecisionLog, saveDecisionLog } from '../../data/entries';
import { db } from '../../data/instance';
import { DECISION_TYPES, type DecisionLog, type DecisionType } from '../../domain/types';
import { alerts } from '../../engine/alerts';
import { reviewStatus } from '../../engine/review';
import { ConfirmButton } from '../components/ConfirmButton';
import { DateField, SelectField, TextField } from '../components/fields';
import { formatDate } from '../format';
import { usePortfolio } from '../hooks';
import { DECISION_LABELS } from '../labels';
import { hrefFor, positionHref } from '../routes';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;
const OUTCOMES = { pendente: 'esperando as 72 horas', vendeu: 'vendida', desistiu: 'desistiu da venda' } as const;

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: ReactNode }) {
  return (
    <li>
      <span className="mark" aria-hidden="true">
        {done ? '✓' : n}
      </span>
      <span>
        <strong>{title}</strong> <span className="muted small">({done ? 'feito' : 'pendente'})</span>
        <span className="hint">{children}</span>
      </span>
    </li>
  );
}

function DiaryForm({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [type, setType] = useState<DecisionType>('outro');
  const [reason, setReason] = useState('');
  const [change, setChange] = useState('');
  const [saved, setSaved] = useState(false);
  return (
    <form
      onSubmit={async e => {
        e.preventDefault();
        if (!reason.trim() || !date || date > today) return;
        await saveDecisionLog(db, { date, type, reason: reason.trim(), wouldChangeIf: change.trim(), relatedIds: [] });
        setReason('');
        setChange('');
        setSaved(true);
      }}
    >
      <SelectField
        label="Tipo"
        value={type}
        onChange={setType}
        options={DECISION_TYPES.filter(t => t !== 'revisao').map(t => [t, DECISION_LABELS[t]] as const)}
      />
      <DateField label="Data" value={date} max={today} onChange={setDate} />
      <TextField
        label="Decisão e motivo"
        value={reason}
        onChange={v => {
          setReason(v);
          setSaved(false);
        }}
        maxLength={2000}
      />
      <TextField label="O que faria você mudar de ideia" value={change} onChange={setChange} maxLength={2000} />
      <button type="submit" className="button" disabled={!reason.trim()}>
        Anotar no diário
      </button>
      {saved && (
        <p role="status" className="muted small">
          Anotado no diário.
        </p>
      )}
    </form>
  );
}

export function Review() {
  const p = usePortfolio();
  if (!p?.settings) return null;
  const status = reviewStatus({ ...p, valuations: p.value.valuations });
  const alertCount = alerts({ ...p, policy: p.activePolicy, now: new Date() }).length;
  const balancesDone = status.reserveBalances.updated === status.reserveBalances.total && status.pensionBalances.updated === status.pensionBalances.total;
  const positionName = (id: string) => {
    const pos = p.positions.find(x => x.id === id);
    return pos ? (pos.ticker ?? pos.name) : null;
  };
  const diary = [...p.decisionLogs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const theses = p.theses.filter(t => p.positions.some(pos => pos.id === t.positionId));

  return (
    <>
      <section className="card" aria-labelledby="review-month-title">
        <h2 id="review-month-title">Revisão de {monthName(status.month)}</h2>
        <ol className="checks">
          <Step n={1} done={balancesDone} title="Atualizar os saldos da reserva e da previdência">
            Saldos do banco no último mês: {status.reserveBalances.updated} de {status.reserveBalances.total} na reserva e{' '}
            {status.pensionBalances.updated} de {status.pensionBalances.total} na previdência. <a href={hrefFor('reserva')}>Reserva</a> ·{' '}
            <a href={hrefFor('previdencia')}>Previdência</a>
          </Step>
          <Step n={2} done={!!status.lastMovement?.startsWith(status.month)} title="Registrar as movimentações do mês">
            {status.lastMovement ? `Última movimentação em ${formatDate(status.lastMovement)}.` : 'Nenhuma movimentação ainda.'}{' '}
            <a href={hrefFor('carteira')}>Carteira</a>
          </Step>
          <Step n={3} done={alertCount === 0} title="Ler os alertas">
            {alertCount === 0 ? 'Nenhum alerta agora.' : `${alertCount} ${alertCount === 1 ? 'alerta' : 'alertas'} no Início.`} <a href={hrefFor('inicio')}>Início</a>
          </Step>
          <Step n={4} done={!!status.plan} title="Decidir o aporte">
            {status.plan ? `Plano de ${formatDate(status.plan.date)}, ${status.plan.status === 'done' ? 'executado' : 'planejado'}.` : 'Nenhum plano neste mês.'}{' '}
            <a href={hrefFor('aporte')}>Aporte do mês</a>
          </Step>
          <Step n={5} done={status.decisions > 0} title="Anotar a decisão no diário">
            {status.decisions === 0 ? 'Nenhuma anotação neste mês.' : `${status.decisions} ${status.decisions === 1 ? 'anotação' : 'anotações'} neste mês.`}
          </Step>
        </ol>
        {status.closed ? (
          <p>Revisão concluída em {formatDate(status.closed.date)}.</p>
        ) : (
          <button
            type="button"
            className="button primary"
            onClick={() => void saveDecisionLog(db, { date: p.today, type: 'revisao', reason: `Revisão de ${monthName(status.month)} concluída.`, wouldChangeIf: '', relatedIds: [] })}
          >
            Concluir a revisão do mês
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="review-diary-title">
        <h2 id="review-diary-title">Diário de decisões</h2>
        <DiaryForm today={p.today} />
        {diary.length === 0 ? (
          <p className="muted">Nenhuma decisão anotada ainda.</p>
        ) : (
          <ul className="plan">
            {diary.map((d: DecisionLog) => (
              <li key={d.id}>
                <div className="split-line">
                  <span>{DECISION_LABELS[d.type]}</span>
                  <span className="muted small">{formatDate(d.date)}</span>
                </div>
                <p className="small">{d.reason}</p>
                {d.wouldChangeIf && <p className="muted small">Mudaria de ideia se: {d.wouldChangeIf}</p>}
                {d.saleIntent && d.relatedIds[0] && (
                  <p className="muted small">
                    Intenção de venda de {positionName(d.relatedIds[0]) ?? 'posição apagada'}: {OUTCOMES[d.saleIntent.outcome]}.
                  </p>
                )}
                <ConfirmButton small label="Apagar" confirmLabel="Apagar esta anotação" onConfirm={() => deleteDecisionLog(db, d.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="review-theses-title">
        <h2 id="review-theses-title">Teses</h2>
        {theses.length === 0 ? (
          <p className="muted">Nenhuma tese ainda. Cada ação, FII, ETF ou cripto pode guardar a sua, na tela da posição.</p>
        ) : (
          <ul className="rows">
            {theses.map(t => (
              <li key={t.id}>
                <a className="row-link" href={positionHref(t.positionId)}>
                  <span>
                    <span className="name">{positionName(t.positionId)}</span>
                    <span className="muted small">
                      {t.text}
                      {t.reviewDate && ` · revisar em ${formatDate(t.reviewDate)}`}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
