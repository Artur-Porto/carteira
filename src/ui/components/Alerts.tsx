// The event alerts of the SPEC, in words, each with where to act. Classes outside their bands share
// one line, since the allocation card already shows each of them.
import { ASSET_CLASS_LABELS } from '../../domain/policy';
import type { Alert } from '../../engine/alerts';
import { Money } from '../discreet';
import { formatDate, formatPct } from '../format';
import { BAND_STATUS_LABELS } from '../labels';
import { hrefFor, positionHref } from '../routes';

const pct = (value: { abs: () => { toFixed: (n: number) => string } }) => formatPct(Number(value.abs().toFixed(2)));

function when(days: number, date: string): string {
  if (days < 0) return `venceu em ${formatDate(date)}: registre o resgate`;
  if (days === 0) return 'vence hoje';
  return `vence em ${formatDate(date)}, daqui a ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

function Line({ alert }: { alert: Alert }) {
  switch (alert.kind) {
    case 'piorCenario':
      return (
        <>
          No pior cenário, {alert.scenario}, a carteira livre perde {pct(alert.pct)}, acima da tolerância de {formatPct(alert.maxDrawdown)}.
          {alert.heaviest && ` O aporte deixa de ir para ${ASSET_CLASS_LABELS[alert.heaviest]}, a classe que mais pesa na perda.`}{' '}
          <a href={hrefFor('cenarios')}>Ver cenários</a>
        </>
      );
    case 'reservaAbaixoDaMeta':
      return (
        <>
          A reserva tem <Money cents={alert.currentCents} /> de <Money cents={alert.goalCents} /> da meta. <a href={hrefFor('reserva')}>Ver a reserva</a>
        </>
      );
    case 'vencimento':
      return (
        <>
          {alert.name} {when(alert.days, alert.date)}. <a href={positionHref(alert.positionId)}>Abrir a posição</a>
        </>
      );
    case 'classeForaDaFaixa':
      return (
        <>
          {ASSET_CLASS_LABELS[alert.assetClass]} está em {pct(alert.pct)}, {BAND_STATUS_LABELS[alert.status]} de {formatPct(alert.band.min)} a{' '}
          {formatPct(alert.band.max)}.
        </>
      );
    case 'emissorAcimaDoLimite':
      return (
        <>
          {alert.conglomerate} tem <Money cents={alert.valueCents} /> com FGC, acima do limite de <Money cents={alert.limitCents} /> por conglomerado.
        </>
      );
    case 'reservaAbaixoDoPiso':
      return (
        <>
          {alert.name} rende {alert.ratePct.replace('.', ',')}% do CDI, abaixo do piso de {formatPct(alert.minPct)}.{' '}
          <a href={positionHref(alert.positionId)}>Abrir a posição</a>
        </>
      );
    case 'carencia':
      return (
        <>
          {alert.plan} libera {formatPct(alert.pct)} da parte da empresa em {formatDate(alert.date)}, mais <Money cents={alert.releasesCents} />.
        </>
      );
    case 'intencaoDeVenda':
      return (
        <>
          A espera de 72 horas para vender {alert.name} terminou. <a href={positionHref(alert.positionId)}>Decidir agora</a>
        </>
      );
    case 'tese':
      return (
        <>
          A tese de {alert.name} estava marcada para revisão em {formatDate(alert.reviewDate)}. <a href={positionHref(alert.positionId)}>Revisar a tese</a>
        </>
      );
  }
}

export function AlertList({ alerts }: { alerts: readonly Alert[] }) {
  const outside = alerts.filter((a): a is Extract<Alert, { kind: 'classeForaDaFaixa' }> => a.kind === 'classeForaDaFaixa');
  const others = alerts.filter(a => a.kind !== 'classeForaDaFaixa');
  if (alerts.length === 0) return <p className="muted">Nenhum alerta agora.</p>;
  return (
    <ul className="checks">
      {others.map((alert, n) => (
        <li key={n}>
          <span className="mark" aria-hidden="true">
            !
          </span>
          <span>
            <Line alert={alert} />
          </span>
        </li>
      ))}
      {outside.length > 0 && (
        <li>
          <span className="mark" aria-hidden="true">
            !
          </span>
          <span>
            Fora da faixa: {outside.map(a => `${ASSET_CLASS_LABELS[a.assetClass]} (${BAND_STATUS_LABELS[a.status]})`).join(', ')}. Os aportes corrigem
            primeiro. <a href={hrefFor('aporte')}>Aporte do mês</a>
          </span>
        </li>
      )}
    </ul>
  );
}
