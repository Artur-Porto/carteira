// Aporte do mês, from the amount to what to execute (SPEC, "Motor de sugestões", steps 1 to 6): the
// reserve's part, the classes with the largest shortfalls, the type of asset in each, and the
// limits and the worst scenario checked on the free portfolio after the plan. Pure.
import { ZERO, type Dec } from '../domain/decimal';
import { grossByClass, type PortfolioValue } from '../domain/portfolio';
import { ASSET_CLASSES, type AssetClass, type Cents, type Institution, type IsoDate, type Policy, type Position } from '../domain/types';
import { allocation, hundredths, type AllocationRow } from './allocation';
import { reservePart, splitAmongClasses, type ClassPart, type ReservePart } from './contribution';
import { classHints, issuerExposures, type Hint, type IssuerExposure } from './hints';
import { scenarioResults, withinTolerance, worstScenario, type ScenarioResult } from './scenarios';

export interface ContributionInput {
  amountCents: Cents;
  today: IsoDate;
  policy: Policy;
  value: PortfolioValue;
  positions: readonly Position[];
  institutions: readonly Institution[];
}

export interface PlannedClass extends ClassPart {
  /** Share of the free portfolio before the contribution; null while it is empty. */
  beforePct: Dec | null;
  afterPct: Dec;
  targetPct: number;
  hints: Hint[];
}

export interface ContributionSuggestion {
  amountCents: Cents;
  reserve: ReservePart;
  /** What goes to the free portfolio. */
  freeCents: Cents;
  classes: PlannedClass[];
  /** The free portfolio after the plan, class by class. */
  after: AllocationRow[];
  criptoOk: boolean;
  /** Worst scenario of the free portfolio after the plan; undefined while it stays empty. */
  worst: ScenarioResult | undefined;
  worstOk: boolean;
  /** Conglomerates at or above the policy's share of the FGC guarantee. */
  issuersAtLimit: IssuerExposure[];
  /**
   * With the worst scenario already past the tolerance, the class that weighs most in it gets no
   * money (SPEC: reduce it, first through the contributions).
   */
  excluded: AssetClass | null;
}

export function planContribution(input: ContributionInput): ContributionSuggestion {
  const { amountCents, policy, value } = input;
  const goalCents = policy.reserve.months * policy.reserve.monthlyCostCents;
  const reserve = reservePart(amountCents, Math.max(0, value.reserve.netCents), goalCents);
  const freeCents = amountCents - reserve.amountCents;

  const beforeByClass = grossByClass(value);
  const before = allocation(beforeByClass, policy.targets, policy.bands);
  const worstBefore = value.free.grossCents > 0 ? worstScenario(scenarioResults(weightsOf(before), policy.scenarios)) : undefined;
  const heaviest = worstBefore && !withinTolerance(worstBefore, policy.maxDrawdown) ? worstBefore.heaviest : null;
  const excluded = heaviest && heaviest !== 'creditoPrivado' ? heaviest : null;
  const parts = splitAmongClasses(freeCents, beforeByClass, policy.targets, policy.limits.criptoMaxPct, excluded ? [excluded] : []);
  const afterByClass = { ...beforeByClass };
  for (const part of parts) afterByClass[part.assetClass] += part.amountCents;

  const after = allocation(afterByClass, policy.targets, policy.bands);
  const row = (rows: AllocationRow[], cls: AssetClass) => rows.find(r => r.assetClass === cls)!;
  const holdings = { positions: input.positions, valuations: value.valuations, institutions: input.institutions, policy, today: input.today };
  const classes = parts.map(part => ({
    ...part,
    beforePct: row(before, part.assetClass).pct,
    afterPct: row(after, part.assetClass).pct ?? ZERO,
    targetPct: policy.targets[part.assetClass],
    hints: classHints(part.assetClass, holdings, afterByClass),
  }));

  const freeAfter = ASSET_CLASSES.reduce((sum, cls) => sum + afterByClass[cls], 0);
  const worst = freeAfter > 0 ? worstScenario(scenarioResults(weightsOf(after), policy.scenarios)) : undefined;
  return {
    amountCents,
    reserve,
    freeCents,
    classes,
    after,
    criptoOk: BigInt(afterByClass.cripto) * 10_000n <= hundredths(policy.limits.criptoMaxPct) * BigInt(freeAfter),
    worst,
    worstOk: worst ? withinTolerance(worst, policy.maxDrawdown) : true,
    issuersAtLimit: issuerExposures(holdings).filter(i => i.valueCents >= i.limitCents),
    excluded,
  };
}

const weightsOf = (rows: readonly AllocationRow[]) => Object.fromEntries(rows.map(r => [r.assetClass, r.pct ?? ZERO]));
