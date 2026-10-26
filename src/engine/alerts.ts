// Event alerts (SPEC, "Alertas"). Old market data and an old backup already have their own notices
// on Início; the PGBL deduction alert needs the yearly income that milestone 5 asks for. Pure.
import { addDays, daysBetween } from '../domain/calendar';
import { dec, type Dec } from '../domain/decimal';
import { pensionStatus } from '../domain/pension';
import { grossByClass, type PortfolioValue } from '../domain/portfolio';
import type { AssetClass, Band, Cents, DecisionLog, Institution, IsoDate, PensionPlan, Policy, Position, Thesis } from '../domain/types';
import { allocation, type BandStatus } from './allocation';
import { issuerExposures } from './hints';
import { scenarioResults, withinTolerance, worstScenario } from './scenarios';

/** Days ahead for a maturity or a vesting step to show up. */
export const ALERT_DAYS = 30;
/** SPEC: a sale outside the plan waits 72 hours. */
export const SALE_WAIT_MS = 72 * 3_600_000;

export type Alert =
  | { kind: 'piorCenario'; scenario: string; pct: Dec; maxDrawdown: number; heaviest: AssetClass | null }
  | { kind: 'reservaAbaixoDaMeta'; currentCents: Cents; goalCents: Cents }
  | { kind: 'vencimento'; positionId: string; name: string; date: IsoDate; days: number }
  | { kind: 'classeForaDaFaixa'; assetClass: AssetClass; status: Exclude<BandStatus, 'dentro'>; pct: Dec; band: Band }
  | { kind: 'emissorAcimaDoLimite'; conglomerate: string; valueCents: Cents; limitCents: Cents }
  | { kind: 'reservaAbaixoDoPiso'; positionId: string; name: string; ratePct: string; minPct: number }
  | { kind: 'carencia'; planId: string; plan: string; date: IsoDate; pct: number; releasesCents: Cents; days: number }
  | { kind: 'intencaoDeVenda'; logId: string; positionId: string; name: string; since: string }
  | { kind: 'tese'; thesisId: string; positionId: string; name: string; reviewDate: IsoDate };

export interface AlertInput {
  today: IsoDate;
  /** Now, for the 72-hour wait. */
  now: Date;
  /** With the thermometer's targets already applied. */
  policy: Policy;
  value: PortfolioValue;
  positions: readonly Position[];
  institutions: readonly Institution[];
  pensionPlans: readonly PensionPlan[];
  decisionLogs: readonly DecisionLog[];
  theses: readonly Thesis[];
}

/** A pending sale intention whose 72 hours are over. */
export const intentionReady = (log: DecisionLog, now: Date) =>
  log.type === 'venda' && log.saleIntent?.outcome === 'pendente' && now.getTime() - Date.parse(log.createdAt) >= SALE_WAIT_MS;

export function alerts(input: AlertInput): Alert[] {
  const { today, policy, value } = input;
  const out: Alert[] = [];
  const name = (id: string) => {
    const p = input.positions.find(pos => pos.id === id);
    return p ? (p.ticker ?? p.name) : 'Posição apagada';
  };

  const free = allocation(grossByClass(value), policy.targets, policy.bands);
  if (value.free.grossCents > 0) {
    const weights = Object.fromEntries(free.map(r => [r.assetClass, r.pct ?? dec(0)]));
    const worst = worstScenario(scenarioResults(weights, policy.scenarios));
    if (worst && !withinTolerance(worst, policy.maxDrawdown)) {
      const heaviest = worst.heaviest && worst.heaviest !== 'creditoPrivado' ? worst.heaviest : null;
      out.push({ kind: 'piorCenario', scenario: worst.scenario.name, pct: worst.pct, maxDrawdown: policy.maxDrawdown, heaviest });
    }
  }

  const goalCents = policy.reserve.months * policy.reserve.monthlyCostCents;
  if (goalCents > 0 && value.reserve.netCents < goalCents) out.push({ kind: 'reservaAbaixoDaMeta', currentCents: Math.max(0, value.reserve.netCents), goalCents });

  const limit = addDays(today, ALERT_DAYS);
  for (const p of input.positions) {
    const v = value.valuations.get(p.id);
    if (!v?.open) continue;
    if (p.maturityDate && p.maturityDate <= limit) out.push({ kind: 'vencimento', positionId: p.id, name: p.ticker ?? p.name, date: p.maturityDate, days: daysBetween(today, p.maturityDate) });
  }

  for (const row of free) {
    if (row.status === 'abaixo' || row.status === 'acima') out.push({ kind: 'classeForaDaFaixa', assetClass: row.assetClass, status: row.status, pct: row.pct!, band: row.band });
  }

  const holdings = { positions: input.positions, valuations: value.valuations, institutions: input.institutions, policy, today };
  for (const i of issuerExposures(holdings)) if (i.valueCents > i.limitCents) out.push({ kind: 'emissorAcimaDoLimite', ...i });

  for (const p of input.positions) {
    if (p.bucket !== 'reserva' || p.indexer !== 'CDI' || p.rate === null || !value.valuations.get(p.id)?.open) continue;
    if (dec(p.rate).lt(policy.reserve.minCdiPct)) out.push({ kind: 'reservaAbaixoDoPiso', positionId: p.id, name: p.name, ratePct: p.rate, minPct: policy.reserve.minCdiPct });
  }

  for (const plan of input.pensionPlans) {
    const next = pensionStatus(plan, today).nextStep;
    if (next && next.date <= limit) out.push({ kind: 'carencia', planId: plan.id, plan: plan.name, date: next.date, pct: next.pct, releasesCents: next.releasesCents, days: daysBetween(today, next.date) });
  }

  for (const log of input.decisionLogs) {
    const positionId = log.relatedIds[0];
    if (positionId && intentionReady(log, input.now)) out.push({ kind: 'intencaoDeVenda', logId: log.id, positionId, name: name(positionId), since: log.createdAt });
  }

  for (const t of input.theses) {
    if (t.reviewDate && t.reviewDate <= today && value.valuations.get(t.positionId)?.open) {
      out.push({ kind: 'tese', thesisId: t.id, positionId: t.positionId, name: name(t.positionId), reviewDate: t.reviewDate });
    }
  }
  return out;
}
