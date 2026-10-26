// SPEC, "Cenários": the loss of each scenario in reais and in percent, and the class that weighs
// most; the free portfolio is what the tolerance applies to.
import { dec, type Dec } from '../../domain/decimal';
import { ASSET_CLASS_LABELS } from '../../domain/policy';
import { grossByClass, latestPensionCents } from '../../domain/portfolio';
import { ASSET_CLASSES, type ScenarioClass } from '../../domain/types';
import { allocation } from '../../engine/allocation';
import { lossCents, patrimonyWeights, scenarioResults, withinTolerance, worstScenario, type ScenarioResult } from '../../engine/scenarios';
import { Money } from '../discreet';
import { formatPct } from '../format';
import { usePortfolio } from '../hooks';
import { hrefFor } from '../routes';

const CLASS_NAMES: Record<ScenarioClass, string> = { ...ASSET_CLASS_LABELS, creditoPrivado: 'Crédito privado' };
const pctText = (pct: Dec) => formatPct(Number(pct.toFixed(2)));

function Results({ results, totalCents }: { results: ScenarioResult[]; totalCents: number | null }) {
  const worst = worstScenario(results);
  return (
    <ul className="rows">
      {results.map(r => (
        <li key={r.scenario.id}>
          <span>
            <span className="name">
              {r.scenario.name}
              {r === worst && ' · o pior'}
            </span>
            {r.heaviest && <span className="muted small">Pesa mais: {CLASS_NAMES[r.heaviest]}</span>}
          </span>
          <span className="amount">
            <span className="num">{pctText(r.pct)}</span>
            {totalCents !== null && (
              <span className="muted small">
                <Money cents={lossCents(r, totalCents)} />
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Scenarios() {
  const p = usePortfolio();
  if (!p?.settings) return null;
  const policy = p.activePolicy;
  const byClass = grossByClass(p.value);
  const free = allocation(byClass, policy.targets, policy.bands);
  const freeResults = p.value.free.grossCents > 0 ? scenarioResults(Object.fromEntries(free.map(r => [r.assetClass, r.pct ?? dec(0)])), policy.scenarios) : [];
  const freeWorst = worstScenario(freeResults);
  const patrimony = patrimonyWeights({
    freeByClass: byClass,
    reserveCents: p.value.reserve.grossCents,
    pensions: p.pensionPlans.map(plan => ({ cents: latestPensionCents(plan), composition: plan.composition })),
  });
  const saved = p.policy ?? policy;
  const targetResults = scenarioResults(Object.fromEntries(ASSET_CLASSES.map(c => [c, dec(saved.targets[c])])), policy.scenarios);
  const tilted = p.thermometer.applied && p.thermometer.tilts.some(t => t.shiftPct !== 0);

  return (
    <>
      <section className="card" aria-labelledby="scenarios-free-title">
        <h2 id="scenarios-free-title">Carteira livre hoje</h2>
        {freeWorst ? (
          <>
            <p>
              No pior cenário, {freeWorst.scenario.name}, a carteira livre perde {formatPct(Number(freeWorst.pct.abs().toFixed(2)))},{' '}
              {withinTolerance(freeWorst, policy.maxDrawdown) ? 'dentro' : 'acima'} da tolerância de {formatPct(policy.maxDrawdown)}.
              {!withinTolerance(freeWorst, policy.maxDrawdown) &&
                freeWorst.heaviest &&
                freeWorst.heaviest !== 'creditoPrivado' &&
                ` Até voltar à tolerância, o aporte do mês deixa de ir para ${ASSET_CLASS_LABELS[freeWorst.heaviest]}, a classe que mais pesa na perda.`}
            </p>
            <Results results={freeResults} totalCents={p.value.free.grossCents} />
          </>
        ) : (
          <p className="muted">A carteira livre ainda está vazia.</p>
        )}
      </section>

      <section className="card" aria-labelledby="scenarios-total-title">
        <h2 id="scenarios-total-title">Patrimônio total</h2>
        {patrimony.totalCents > 0 ? (
          <>
            <Results results={scenarioResults(patrimony.weights, policy.scenarios)} totalCents={patrimony.totalCents} />
            <p className="muted small">
              A reserva entra sem choque. A previdência segue a composição informada em cada plano, com a linha do crédito privado.
              {patrimony.pensionWithoutCompositionCents > 0 && (
                <>
                  {' '}
                  <Money cents={patrimony.pensionWithoutCompositionCents} /> de previdência sem composição informada entram sem choque.{' '}
                  <a href={hrefFor('previdencia')}>Informar a composição</a>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="muted">Ainda não há patrimônio registrado.</p>
        )}
      </section>

      <section className="card" aria-labelledby="scenarios-target-title">
        <h2 id="scenarios-target-title">Alocação-alvo da política</h2>
        <Results results={targetResults} totalCents={null} />
        {tilted && (
          <p className="muted small">
            Com o termômetro, o pior cenário dos alvos perde{' '}
            {formatPct(Number(worstScenario(scenarioResults(Object.fromEntries(ASSET_CLASSES.map(c => [c, dec(policy.targets[c])])), policy.scenarios))!.pct.abs().toFixed(2)))}.
          </p>
        )}
        <p className="muted small">
          A perda de um cenário é a soma de peso vezes choque de cada classe. Os choques são premissas, não previsões, e mudam na{' '}
          <a href={hrefFor('politica')}>Política</a>.
        </p>
      </section>
    </>
  );
}
