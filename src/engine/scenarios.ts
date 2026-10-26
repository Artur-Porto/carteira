// Scenario test (SPEC, "Teste de cenários"): the result of a scenario is the sum of weight times
// shock of each class. Pure.
import { Dec, ZERO, scaleCents } from '../domain/decimal';
import { ASSET_CLASSES, SCENARIO_CLASSES, type AssetClass, type Cents, type Scenario, type ScenarioClass } from '../domain/types';

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

export interface PatrimonyInput {
  freeByClass: Record<AssetClass, Cents>;
  reserveCents: Cents;
  pensions: readonly { cents: Cents; composition: Partial<Record<ScenarioClass, number>> }[];
}

export interface PatrimonyWeights {
  totalCents: Cents;
  /** Percent of the whole patrimony in each class; the reserve has no class, so no shock. */
  weights: Partial<Record<ScenarioClass, Dec>>;
  /** Pension balance with no composition informed, counted without a shock. */
  pensionWithoutCompositionCents: Cents;
}

/**
 * SPEC, "Teste de cenários": on the whole patrimony the reserve takes no shock, and the pension
 * follows the composition informed for each plan, with its own line for private credit.
 */
export function patrimonyWeights({ freeByClass, reserveCents, pensions }: PatrimonyInput): PatrimonyWeights {
  const amounts: Partial<Record<ScenarioClass, Dec>> = {};
  const add = (cls: ScenarioClass, value: Dec) => (amounts[cls] = (amounts[cls] ?? ZERO).plus(value));
  for (const cls of ASSET_CLASSES) add(cls, new Dec(freeByClass[cls]));
  let withoutComposition = 0;
  for (const { cents, composition } of pensions) {
    const parts = SCENARIO_CLASSES.filter(cls => (composition[cls] ?? 0) > 0);
    const sum = parts.reduce((s, cls) => s + composition[cls]!, 0);
    if (sum <= 0) {
      withoutComposition += cents;
      continue;
    }
    for (const cls of parts) add(cls, new Dec(cents).mul(composition[cls]!).div(sum));
  }
  const totalCents = ASSET_CLASSES.reduce((s, cls) => s + freeByClass[cls], 0) + reserveCents + pensions.reduce((s, p) => s + p.cents, 0);
  const weights: Partial<Record<ScenarioClass, Dec>> = {};
  if (totalCents > 0) for (const cls of SCENARIO_CLASSES) if (amounts[cls]) weights[cls] = amounts[cls].mul(100).div(totalCents);
  return { totalCents, weights, pensionWithoutCompositionCents: withoutComposition };
}

/** The result of a scenario in centavos of a portfolio worth `totalCents`, rounded to the centavo. */
export const lossCents = (result: ScenarioResult, totalCents: Cents): Cents => scaleCents(totalCents, result.pct.div(100));

/** Whether a loss stays within the policy's tolerance, such as 20 for a fall of at most 20%. */
export const withinTolerance = (result: ScenarioResult, maxDrawdown: number): boolean => result.pct.gte(-maxDrawdown);
