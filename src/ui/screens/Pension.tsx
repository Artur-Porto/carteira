import { completedYears } from '../../domain/calendar';
import { pensionStatus } from '../../domain/pension';
import type { IsoDate, PensionPlan } from '../../domain/types';
import { Money } from '../discreet';
import { formatDate, formatPct } from '../format';
import { TAX_REGIME_LABELS } from '../labels';
import { usePortfolio } from '../hooks';

function PlanCard({ plan, today }: { plan: PensionPlan; today: IsoDate }) {
  const status = pensionStatus(plan, today);
  const { balance } = status;
  const years = completedYears(plan.startDate, today);
  return (
    <section className="card" aria-labelledby={`plan-${plan.id}`}>
      <h2 id={`plan-${plan.id}`}>{plan.name}</h2>
      {balance ? (
        <>
          <p className="big">
            <Money cents={balance.ownCents + balance.companyCents} />
          </p>
          <dl className="rows">
            <div>
              <dt>Parte própria</dt>
              <dd>
                <Money cents={balance.ownCents} />
              </dd>
            </div>
            <div>
              <dt>Parte da empresa</dt>
              <dd>
                <Money cents={balance.companyCents} />
              </dd>
            </div>
            <div>
              <dt>Liberado da parte da empresa</dt>
              <dd>{formatPct(status.vestedPct)}</dd>
            </div>
            <div>
              <dt>Saldo garantido hoje</dt>
              <dd>
                <Money cents={status.guaranteedCents} />
              </dd>
            </div>
          </dl>
          <p className="muted small">Saldo de {formatDate(balance.date)}. Atualize todo mês, na revisão mensal.</p>
        </>
      ) : (
        <p className="notice">Nenhum saldo informado ainda.</p>
      )}
      <p>
        {years} {years === 1 ? 'ano' : 'anos'} de plano, desde {formatDate(plan.startDate)}.{' '}
        {status.nextStep ? (
          <>
            Próximo degrau em <strong>{formatDate(status.nextStep.date)}</strong>: {formatPct(status.nextStep.pct)} da parte da empresa,
            liberando mais <Money cents={status.nextStep.releasesCents} />.
          </>
        ) : plan.vestingTable.length === 0 ? (
          'A tabela de carência ainda não foi informada.'
        ) : (
          'A carência já foi toda cumprida.'
        )}
      </p>
      {plan.vestingTable.length > 0 && (
        <p className="muted small">Sem degraus intermediários na tabela, vale o último degrau já atingido.</p>
      )}
      <p className="muted small">
        Contribuição própria de <Money cents={plan.ownMonthlyCents} /> por mês, com contrapartida de {formatPct(plan.matchPct)}. Regime de
        tributação: {TAX_REGIME_LABELS[plan.taxRegime].toLowerCase()}.
      </p>
      <a className="button primary" href={`#/previdencia/${encodeURIComponent(plan.id)}/saldo`}>
        Atualizar saldo
      </a>
      <a className="button" href={`#/previdencia/plano/${encodeURIComponent(plan.id)}`}>
        Editar plano
      </a>
    </section>
  );
}

export function Pension() {
  const p = usePortfolio();
  if (!p) return null;
  return (
    <>
      {p.pensionPlans.length === 0 && (
        <section className="card">
          <p>Nenhum plano de previdência cadastrado.</p>
          <p className="muted small">Cadastre o PGBL da empresa para ver o saldo garantido e a próxima data de carência.</p>
        </section>
      )}
      {p.pensionPlans.map(plan => (
        <PlanCard key={plan.id} plan={plan} today={p.today} />
      ))}
      <a className="button" href="#/previdencia/plano">
        {p.pensionPlans.length === 0 ? 'Cadastrar plano' : 'Cadastrar outro plano'}
      </a>
      <p className="muted small">O simulador da dedução do PGBL no IR chega no marco 5.</p>
    </>
  );
}
