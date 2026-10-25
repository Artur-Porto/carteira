// Scenario test (SPEC, "Teste de cenários"): the result of a scenario is the sum of weight times
// shock of each class. Pure.
import { Dec, ZERO } from '../domain/decimal';
import { SCENARIO_CLASSES, type Scenario, type ScenarioClass } from '../domain/types';

export interface ScenarioResult {
  scenario: Scenario;
  /** Percent of the portfolio, negative for a loss: -18.38 is a fall of 18,38%. */
  pct: Dec;
  /** The class whose weight times shock takes the most, or null when nothing falls. */
  heaviest: ScenarioClass | null;
}

/** `weights` are percentages of the portfolio by class, adding up to 100. */
export function scenarioResults(weights: Partial<Record<ScenarioClass, Dec>>, scenarios: readonly Scenario[]): ScenarioResult[] {
  return scenarios.map(scenario => {
    let pct = ZERO;
    let heaviest: ScenarioClass | null = null;
    let heaviestPart = ZERO;
    for (const cls of SCENARIO_CLASSES) {
      const part = (weights[cls] ?? ZERO).mul(scenario.shocks[cls] ?? 0).div(100);
      pct = pct.plus(part);
      if (part.lt(heaviestPart)) {
        heaviestPart = part;
        heaviest = cls;
      }
    }
    return { scenario, pct, heaviest };
  });
}

/** The scenario with the largest loss; the first one wins a tie. Undefined without scenarios. */
export function worstScenario(results: readonly ScenarioResult[]): ScenarioResult | undefined {
  return results.reduce<ScenarioResult | undefined>((worst, r) => (!worst || r.pct.lt(worst.pct) ? r : worst), undefined);
}

/** Whether a loss stays within the policy's tolerance, such as 20 for a fall of at most 20%. */
export const withinTolerance = (result: ScenarioResult, maxDrawdown: number): boolean => result.pct.gte(-maxDrawdown);
