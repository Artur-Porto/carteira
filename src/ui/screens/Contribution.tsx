import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ReactNode } from 'react';
import { deleteContributionPlan, saveContributionPlan, setContributionPlanStatus } from '../../data/entries';
import { db } from '../../data/instance';
import { ASSET_CLASS_LABELS, initialPolicy } from '../../domain/policy';
import { reserveMonths } from '../../domain/portfolio';
import type { Cents, ContributionPlan } from '../../domain/types';
import { MIN_PARCEL_CENTS, type ReservePart } from '../../engine/contribution';
import type { Hint } from '../../engine/hints';
import { planContribution, type ContributionSuggestion, type PlannedClass } from '../../engine/plan';
import { ConfirmButton } from '../components/ConfirmButton';
import { NumberField } from '../components/fields';
import { Money } from '../discreet';
import { formatCents, formatDate, formatPct } from '../format';
import { usePortfolio } from '../hooks';
import { readCents } from '../input';
import { BAND_STATUS_LABELS, CLASS_TYPE_TEXTS } from '../labels';
import { hrefFor } from '../routes';

const ORDINALS = ['Maior déficit', 'Segundo maior déficit', 'Terceiro maior déficit'];
const share = (pct: { toFixed: (n: number) => string } | null) => (pct ? formatPct(Number(pct.toFixed(1))) : '0%');
const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);

/** SPEC, "Reserva": the assets the reserve accepts. */
const RESERVE_TYPE = 'Pós-fixado com resgate diário e FGC, como CDB, RDB ou cofrinho, ou Tesouro Selic e Tesouro Reserva, rendendo ao menos o piso da política.';

function reserveReason(r: ReservePart, amountCents: Cents, monthlyCostCents: Cents, targetMonths: number): string {
  if (targetMonths === 0) return 'A política não tem meta de reserva, então todo o aporte vai para a carteira livre.';
  const months = reserveMonths(r.currentCents, monthlyCostCents);
  const cover = `A reserva cobre ${(months ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} de ${targetMonths} meses`;
  switch (r.zone) {
    case 'abaixoDaMetade':
      return r.amountCents === amountCents
        ? `${cover}, menos da metade da meta, e recebe todo o aporte.`
        : `${cover}, menos da metade da meta: recebe tudo até a metade e 50% do restante, até completar a meta.`;
    case 'abaixoDaMeta':
      return r.amountCents === Math.ceil(amountCents / 2)
        ? `${cover}, entre a metade e a meta, e recebe 50% do aporte.`
        : `${cover} e recebe só o que falta para completar a meta.`;
    case 'cheia':
      return `${cover}: a meta já está cheia, e todo o aporte vai para a carteira livre.`;
  }
}

function HintText({ hint }: { hint: Hint }): ReactNode {
  switch (hint.kind) {
    case 'vazia':
      return 'A classe ainda não tem posição na carteira.';
    case 'escada':
      return `${hint.years.length === 1 ? 'Ano vago' : 'Anos vagos'} na escada do médio prazo: ${list(hint.years.map(String))}. Prefira um vencimento em ${hint.years[0]}.`;
    case 'emissores':
      return (
        <>
          {hint.withRoom.length > 0 && (
            <>
              Emissores com FGC abaixo do limite de <Money cents={hint.withRoom[0]!.limitCents} /> por conglomerado:{' '}
              {hint.withRoom.map((i, n) => (
                <span key={i.conglomerate}>
                  {n > 0 && (n === hint.withRoom.length - 1 ? ' e ' : ', ')}
                  {i.conglomerate} (cabe mais <Money cents={i.limitCents - i.valueCents} />)
                </span>
              ))}
              .{' '}
            </>
          )}
          {hint.full.length > 0 && `${list(hint.full.map(i => i.conglomerate))} ${hint.full.length === 1 ? 'já chegou' : 'já chegaram'} ao limite: escolha outro emissor.`}
        </>
      );
    case 'acoes':
      return `${list(hint.over.map(a => a.name))} já ${hint.over.length === 1 ? 'passa' : 'passam'} de ${formatPct(hint.maxPct)} da carteira livre: prefira o ETF amplo.`;
    case 'fiis':
      return `${list(hint.over.map(a => a.name))} já ${hint.over.length === 1 ? 'passa' : 'passam'} de ${formatPct(hint.maxPct)} da classe: prefira outro FII.`;
    case 'cripto':
      return (
        <>
          Cabe mais <Money cents={hint.roomCents} /> sem passar do teto de {formatPct(hint.maxPct)} da carteira livre.
        </>
      );
  }
}

function ClassItem({ part, index }: { part: PlannedClass; index: number }) {
  return (
    <li>
      <div className="split-line">
        <span>{ASSET_CLASS_LABELS[part.assetClass]}</span>
        <Money cents={part.amountCents} />
      </div>
      <p className="small">
        {ORDINALS[index]}: faltam <Money cents={part.shortfallCents} /> para o alvo de {formatPct(part.targetPct)}, já contando o aporte. Hoje,{' '}
        {share(part.beforePct)}; depois do aporte, {share(part.afterPct)}.
        {part.merged.length > 0 &&
          ` Inclui a parcela de ${list(part.merged.map(c => ASSET_CLASS_LABELS[c]))}, que ficaria abaixo de ${formatCents(MIN_PARCEL_CENTS)}.`}
      </p>
      <ul className="small">
        <li>Tipo: {CLASS_TYPE_TEXTS[part.assetClass]}</li>
        {part.hints.map((hint, n) => (
          <li key={n}>
            <HintText hint={hint} />
          </li>
        ))}
      </ul>
      <p className="muted small">Regra: maior déficit em reais frente ao alvo, até três classes por aporte.</p>
    </li>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li>
      <span className="mark" aria-hidden="true">
        {ok ? '✓' : '!'}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Checks({ s, maxDrawdown, criptoMaxPct }: { s: ContributionSuggestion; maxDrawdown: number; criptoMaxPct: number }) {
  if (s.freeCents === 0) return null;
  const cripto = s.after.find(r => r.assetClass === 'cripto')!;
  const outside = s.after.filter(r => r.status && r.status !== 'dentro');
  return (
    <section className="card" aria-labelledby="contribution-checks-title">
      <h2 id="contribution-checks-title">Checagem depois do aporte</h2>
      <ul className="checks">
        <Check ok={s.criptoOk}>
          Cripto fica em {share(cripto.pct)} da carteira livre, {s.criptoOk ? 'dentro do' : 'acima do'} teto de {formatPct(criptoMaxPct)}.
        </Check>
        {s.worst && (
          <Check ok={s.worstOk}>
            Pior cenário: {s.worst.scenario.name}, com perda de {formatPct(Number(s.worst.pct.abs().toFixed(2)))} da carteira livre,{' '}
            {s.worstOk ? 'dentro da' : 'acima da'} tolerância de {formatPct(maxDrawdown)}.
            {!s.worstOk && s.worst.heaviest && s.worst.heaviest !== 'creditoPrivado' && ` A classe que mais pesa na perda é ${ASSET_CLASS_LABELS[s.worst.heaviest]}.`}
          </Check>
        )}
        <Check ok={outside.length === 0}>
          {outside.length === 0
            ? 'Todas as classes ficam dentro da faixa.'
            : `Continuam fora da faixa: ${list(outside.map(r => `${ASSET_CLASS_LABELS[r.assetClass]} (${BAND_STATUS_LABELS[r.status!]})`))}. Os próximos aportes seguem corrigindo.`}
        </Check>
        {s.issuersAtLimit.map(i => (
          <Check key={i.conglomerate} ok={false}>
            {i.conglomerate} tem <Money cents={i.valueCents} /> com FGC, no limite de <Money cents={i.limitCents} /> por conglomerado ou acima dele.
          </Check>
        ))}
      </ul>
    </section>
  );
}

function PlanHistory({ plans }: { plans: ContributionPlan[] }) {
  if (plans.length === 0) return null;
  return (
    <section className="card" aria-labelledby="contribution-history-title">
      <h2 id="contribution-history-title">Planos</h2>
      <ul className="plan">
        {plans.map(plan => (
          <li key={plan.id}>
            <div className="split-line">
              <span>
                {formatDate(plan.date)} · {plan.status === 'done' ? 'executado' : 'planejado'}
              </span>
              <Money cents={plan.amountCents} />
            </div>
            <ul className="small">
              {plan.splits.map(split => (
                <li key={split.target}>
                  {split.target === 'reserva' ? 'Reserva' : ASSET_CLASS_LABELS[split.target]}: <Money cents={split.amountCents} />
                </li>
              ))}
            </ul>
            {plan.status === 'planned' && (
              <button type="button" className="button" onClick={() => void setContributionPlanStatus(db, plan.id, 'done')}>
                Marcar como executado
              </button>
            )}
            <ConfirmButton small label="Apagar plano" confirmLabel="Apagar de vez" onConfirm={() => deleteContributionPlan(db, plan.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Contribution() {
  const p = usePortfolio();
  const plans = useLiveQuery(() => db.contributionPlans.orderBy('date').reverse().toArray());
  const [text, setText] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  if (!p?.settings) return null;

  const policy = p.policy ?? initialPolicy(p.settings.createdAt);
  const amount = readCents(text);
  const valid = amount !== null && amount > 0;
  const needsCost = policy.reserve.months > 0 && policy.reserve.monthlyCostCents <= 0;
  const s = valid && !needsCost ? planContribution({ amountCents: amount, today: p.today, policy, value: p.value, positions: p.positions, institutions: p.institutions }) : null;
  const key = s ? `${amount}|${s.reserve.amountCents}|${s.classes.map(c => `${c.assetClass}:${c.amountCents}`).join(',')}` : null;

  return (
    <>
      <section className="card" aria-labelledby="contribution-amount-title">
        <h2 id="contribution-amount-title">Quanto vai aportar</h2>
        <NumberField
          label="Valor do aporte"
          value={text}
          onChange={v => {
            setText(v);
            setSavedAt(null);
          }}
          placeholder="0,00"
          enterKeyHint="done"
          hint={valid ? `Lido como ${formatCents(amount)}.` : 'O app separa a parte da reserva e divide o resto entre as classes com maior déficit.'}
          error={text.trim() && !valid ? 'Informe o valor, como 3.000,00.' : null}
        />
        {needsCost && (
          <p className="notice">
            Informe o custo de vida mensal para o app calcular a parte da reserva. <a href={hrefFor('politica')}>Abrir a política</a>
          </p>
        )}
      </section>

      {s && (
        <>
          <section className="card" aria-labelledby="contribution-plan-title">
            <h2 id="contribution-plan-title">Distribuição sugerida</h2>
            <ul className="plan">
              <li>
                <div className="split-line">
                  <span>Reserva</span>
                  <Money cents={s.reserve.amountCents} />
                </div>
                <p className="small">{reserveReason(s.reserve, s.amountCents, policy.reserve.monthlyCostCents, policy.reserve.months)}</p>
                {s.reserve.amountCents > 0 && (
                  <ul className="small">
                    <li>Tipo: {RESERVE_TYPE}</li>
                  </ul>
                )}
                <p className="muted small">Regra: prioridade da reserva no aporte, pelo valor líquido de IR.</p>
              </li>
              {s.classes.map((part, index) => (
                <ClassItem key={part.assetClass} part={part} index={index} />
              ))}
            </ul>
            <p className="muted small">O app indica a classe, o tipo e o valor. A escolha do ativo e a ordem na corretora são suas.</p>
          </section>

          <Checks s={s} maxDrawdown={policy.maxDrawdown} criptoMaxPct={policy.limits.criptoMaxPct} />

          <button
            type="button"
            className="button primary"
            disabled={savedAt === key}
            onClick={async () => {
              await saveContributionPlan(db, {
                date: p.today,
                amountCents: s.amountCents,
                splits: [
                  ...(s.reserve.amountCents > 0 ? [{ target: 'reserva' as const, amountCents: s.reserve.amountCents }] : []),
                  ...s.classes.map(c => ({ target: c.assetClass, amountCents: c.amountCents })),
                ],
                status: 'planned',
              });
              setSavedAt(key);
            }}
          >
            {savedAt === key ? 'Plano salvo' : 'Salvar plano'}
          </button>
          <p className="muted small">
            Depois de executar, registre cada compra na Carteira e marque o plano como executado.
          </p>
        </>
      )}

      <PlanHistory plans={plans ?? []} />
    </>
  );
}
