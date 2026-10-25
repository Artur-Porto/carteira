// Reference cases of the contribution engine (SPEC, milestone 3: "Casos de referência do motor
// passam"). The expected values come from an independent implementation of the same rules in
// Python, with exact fractions (docs/marco-3.md). Every portfolio here is fictitious.
import { describe, expect, it } from 'vitest';
import { dec } from '../../src/domain/decimal';
import { INITIAL_SCENARIOS, initialPolicy, policyErrors } from '../../src/domain/policy';
import type { PortfolioValue, Totals } from '../../src/domain/portfolio';
import { ASSET_CLASSES, type AssetClass, type Institution, type Policy, type Position } from '../../src/domain/types';
import type { Valuation } from '../../src/domain/valuation';
import { allocation, bandStatus } from '../../src/engine/allocation';
import { levelFill, reservePart, splitAmongClasses } from '../../src/engine/contribution';
import { classHints, issuerExposures, vacantLadderYears } from '../../src/engine/hints';
import { planContribution } from '../../src/engine/plan';
import { scenarioResults, worstScenario } from '../../src/engine/scenarios';

const NOW = '2026-10-25T12:00:00.000Z';
const TODAY = '2026-10-25';
const reais = (value: number | string) => Math.round(Number(value) * 100);
type Values = Partial<Record<AssetClass, number>>;
const byClass = (values: Values) => Object.fromEntries(ASSET_CLASSES.map(c => [c, reais(values[c] ?? 0)])) as Record<AssetClass, number>;

function withTargets(targets: Record<AssetClass, number>): Policy {
  const policy = initialPolicy(NOW, 600_000);
  return { ...policy, targets };
}

describe('reserve part of the contribution (SPEC: the three bands of coverage)', () => {
  // Goal of 12 months of R$ 6.000,00: R$ 72.000,00, and half of it R$ 36.000,00.
  it.each([
    ['R1 below half: 100%', 20000, 72000, 5000, 500_000, 'abaixoDaMetade'],
    ['R2 crosses half: 100% up to it, then 50%', 34000, 72000, 5000, 350_000, 'abaixoDaMetade'],
    ['R3 between half and goal: 50%', 50000, 72000, 3000, 150_000, 'abaixoDaMeta'],
    ['R4 fills the goal and stops', 70500, 72000, 5000, 150_000, 'abaixoDaMeta'],
    ['R5 goal met: nothing', 72000, 72000, 5000, 0, 'cheia'],
    ['R6 above the goal: nothing', 80000, 72000, 5000, 0, 'cheia'],
    ['R7 the odd centavo goes to the reserve', 50000, 72000, '1000.01', 50_001, 'abaixoDaMeta'],
    ['R8 crosses both thresholds', 10000, 72000, 100000, 6_200_000, 'abaixoDaMetade'],
    ['R9 no goal', 0, 0, 1000, 0, 'cheia'],
  ] as const)('%s', (_name, current, goal, amount, expected, zone) => {
    expect(reservePart(reais(amount), reais(current), reais(goal))).toEqual({
      goalCents: reais(goal),
      currentCents: reais(current),
      zone,
      amountCents: expected,
    });
  });
});

describe('split among the classes with the largest shortfalls', () => {
  const C1: Values = { rfPosFixada: 25000, rfIpcaCurta: 12000, rfPrefixada: 8000, rfIpcaLonga: 15000, acoesBrasil: 14000, fiis: 9000, exterior: 15000, cripto: 2000 };
  const cases: [string, number, Values, [AssetClass, number, number, AssetClass[]?][], Record<AssetClass, number>?][] = [
    ['C1 the largest shortfall alone, then tied with the second', 3000, C1, [['rfIpcaCurta', 197_000, 448_000], ['rfIpcaLonga', 103_000, 354_000]]],
    [
      'C2 a parcel under R$ 100 joins the largest shortfall; tied remainders follow the order',
      900,
      { rfPosFixada: 30000, rfIpcaCurta: 20000, rfPrefixada: 9000, rfIpcaLonga: 13162, acoesBrasil: 7628, fiis: 9000, exterior: 8517, cripto: 2693 },
      [['rfIpcaLonga', 69_333, 500_000, ['acoesBrasil']], ['exterior', 20_667, 460_000]],
    ],
    [
      'C3 at most three classes',
      1500,
      { rfPosFixada: 20330, rfIpcaCurta: 14440, rfPrefixada: 11000, rfIpcaLonga: 16370, acoesBrasil: 10580, fiis: 12000, exterior: 11495, cripto: 3785 },
      [['rfPosFixada', 60_000, 200_000], ['rfIpcaLonga', 50_000, 190_000], ['rfIpcaCurta', 40_000, 180_000]],
    ],
    ['C4 empty free portfolio', 10000, {}, [['rfPosFixada', 366_667, 220_000], ['rfIpcaLonga', 326_667, 180_000], ['rfIpcaCurta', 306_666, 160_000]]],
    [
      'C5 crypto stops at its cap',
      10000,
      {},
      [['rfPosFixada', 575_000, 500_000], ['acoesBrasil', 375_000, 300_000], ['cripto', 50_000, 50_000]],
      { rfPosFixada: 50, rfIpcaCurta: 3, rfPrefixada: 0, rfIpcaLonga: 4, acoesBrasil: 30, fiis: 4, exterior: 4, cripto: 5 },
    ],
    [
      'C6 tied shortfalls follow the order of the policy',
      150,
      { rfPosFixada: 10033, rfIpcaCurta: 7024, rfPrefixada: 4500, rfIpcaLonga: 9500, acoesBrasil: 6500, fiis: 4400, exterior: 6543, cripto: 1500 },
      [['rfPosFixada', 15_000, 100_000, ['rfIpcaCurta']]],
    ],
    [
      'C7 targets with decimals',
      2000,
      { rfPosFixada: 21000, rfIpcaCurta: 15000, rfPrefixada: 8200, rfIpcaLonga: 17000, acoesBrasil: 12500, fiis: 7900, exterior: 15400, cripto: 3000 },
      [['rfIpcaLonga', 130_167, 212_500, ['rfPosFixada']], ['rfIpcaCurta', 69_833, 157_500]],
      { rfPosFixada: 21.5, rfIpcaCurta: 16.25, rfPrefixada: 8, rfIpcaLonga: 18.75, acoesBrasil: 12, fiis: 7.5, exterior: 13, cripto: 3 },
    ],
  ];
  it.each(cases)('%s', (_name, amount, values, expected, targets) => {
    const parts = splitAmongClasses(reais(amount), byClass(values), targets ?? initialPolicy(NOW).targets, 5);
    expect(parts).toEqual(expected.map(([assetClass, amountCents, shortfallCents, merged]) => ({ assetClass, amountCents, shortfallCents, merged: merged ?? [] })));
    expect(parts.reduce((sum, p) => sum + p.amountCents, 0)).toBe(reais(amount));
  });

  it('levels exact fractions and respects caps', () => {
    const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
    const fractions = ({ nums, den }: { nums: bigint[]; den: bigint }) =>
      nums.map(n => (n % den === 0n ? `${n / den}` : `${n / gcd(n, den)}/${den / gcd(n, den)}`));
    expect(fractions(levelFill([10n, 6n], [null, null], 6n))).toEqual(['5', '1']);
    expect(fractions(levelFill([3n, 3n, 3n], [null, null, null], 1n))).toEqual(['1/3', '1/3', '1/3']);
    expect(fractions(levelFill([10n, 6n], [2n, null], 10n))).toEqual(['2', '8']);
    expect(fractions(levelFill([10n], [null], 0n))).toEqual(['0']);
  });
});

function portfolio(reserveNet: number, values: Values, valuations = new Map<string, Valuation>()): PortfolioValue {
  const totals = (gross: number): Totals => ({ costCents: gross, grossCents: gross, netCents: gross });
  const classes = byClass(values);
  const free = ASSET_CLASSES.reduce((sum, c) => sum + classes[c], 0);
  return {
    valuations,
    reserve: totals(reais(reserveNet)),
    free: totals(free),
    byClass: Object.fromEntries(ASSET_CLASSES.map(c => [c, totals(classes[c])])) as Record<AssetClass, Totals>,
    pensionCents: 0,
    unpricedCount: 0,
  };
}

describe('whole plan (SPEC, steps 1 to 6)', () => {
  it('P1: reserve between half and goal, then the largest shortfalls, then the checks', () => {
    const values: Values = { rfPosFixada: 25000, rfIpcaCurta: 12000, rfPrefixada: 8000, rfIpcaLonga: 15000, acoesBrasil: 14000, fiis: 9000, exterior: 15000, cripto: 2000 };
    const plan = planContribution({ amountCents: reais(5000), today: TODAY, policy: initialPolicy(NOW, 600_000), value: portfolio(50000, values), positions: [], institutions: [] });
    expect(plan.reserve).toMatchObject({ goalCents: 7_200_000, zone: 'abaixoDaMeta', amountCents: 250_000 });
    expect(plan.freeCents).toBe(250_000);
    expect(plan.classes.map(c => [c.assetClass, c.amountCents, c.shortfallCents])).toEqual([
      ['rfIpcaCurta', 172_500, 440_000],
      ['rfIpcaLonga', 77_500, 345_000],
    ]);
    expect(plan.classes[0]!.beforePct!.toFixed(2)).toBe('12.00');
    expect(plan.classes[0]!.afterPct.toFixed(4)).toBe('13.3902');
    expect(Object.fromEntries(plan.after.map(r => [r.assetClass, r.pct!.toFixed(4)]))).toEqual({
      rfPosFixada: '24.3902', rfIpcaCurta: '13.3902', rfPrefixada: '7.8049', rfIpcaLonga: '15.3902',
      acoesBrasil: '13.6585', fiis: '8.7805', exterior: '14.6341', cripto: '1.9512',
    });
    expect(plan.after.filter(r => r.status !== 'dentro').map(r => [r.assetClass, r.status])).toEqual([['cripto', 'abaixo']]);
    expect(plan.criptoOk).toBe(true);
    expect(plan.worst!.scenario.id).toBe('criseGlobal');
    expect(plan.worst!.pct.toFixed(4)).toBe('-18.4332');
    expect(plan.worst!.heaviest).toBe('acoesBrasil');
    expect(plan.worstOk).toBe(true);
  });

  it('C5: a worst scenario past the tolerance is flagged', () => {
    const policy = withTargets({ rfPosFixada: 50, rfIpcaCurta: 3, rfPrefixada: 0, rfIpcaLonga: 4, acoesBrasil: 30, fiis: 4, exterior: 4, cripto: 5 });
    const plan = planContribution({ amountCents: reais(10000), today: TODAY, policy: { ...policy, reserve: { ...policy.reserve, months: 0 } }, value: portfolio(0, {}), positions: [], institutions: [] });
    expect(plan.reserve.amountCents).toBe(0);
    expect(plan.worst!.pct.toFixed(4)).toBe('-22.2500');
    expect(plan.worstOk).toBe(false);
    expect(plan.criptoOk).toBe(true);
  });

  it('sends everything to the reserve below half of the goal', () => {
    const plan = planContribution({ amountCents: reais(5000), today: TODAY, policy: initialPolicy(NOW, 600_000), value: portfolio(20000, {}), positions: [], institutions: [] });
    expect(plan.reserve.amountCents).toBe(500_000);
    expect(plan.classes).toEqual([]);
    expect(plan.worst).toBeUndefined();
  });
});

describe('allocation against the target (SPEC: 5/25 bands)', () => {
  it('detects classes outside their bands, with the edges inside', () => {
    const policy = initialPolicy(NOW);
    const values: Values = { rfPosFixada: 17000, rfIpcaCurta: 11999.99, rfPrefixada: 10000, rfIpcaLonga: 22500.01, acoesBrasil: 15000, fiis: 6000, exterior: 9750, cripto: 7750 };
    const rows = allocation(byClass(values), policy.targets, policy.bands);
    expect(Object.fromEntries(rows.map(r => [r.assetClass, r.status]))).toEqual({
      rfPosFixada: 'dentro', rfIpcaCurta: 'abaixo', rfPrefixada: 'dentro', rfIpcaLonga: 'acima',
      acoesBrasil: 'dentro', fiis: 'dentro', exterior: 'dentro', cripto: 'acima',
    });
    expect(rows[1]!.pct!.toFixed(5)).toBe('11.99999');
    expect(bandStatus(0, 100, { min: 0, max: 0 })).toBe('dentro');
  });

  it('has no shares while the free portfolio is empty', () => {
    const policy = initialPolicy(NOW);
    expect(allocation(byClass({}), policy.targets, policy.bands).every(r => r.pct === null && r.status === null)).toBe(true);
  });

  it('loses what the SPEC table says with the target allocation', () => {
    const weights = Object.fromEntries(ASSET_CLASSES.map(c => [c, dec(initialPolicy(NOW).targets[c])]));
    const results = scenarioResults(weights, INITIAL_SCENARIOS);
    expect(results.map(r => r.pct.toFixed(2))).toEqual(['-18.38', '-12.02', '-11.70', '-11.92', '-2.40']);
    expect(worstScenario(results)!.scenario.id).toBe('criseGlobal');
    expect(worstScenario(results)!.heaviest).toBe('acoesBrasil');
  });
});

describe('type of asset within the class (SPEC, step 5)', () => {
  const stamp = { createdAt: NOW, updatedAt: NOW };
  const institution = (id: string, conglomerate: string, fgcCovered = true): Institution => ({ id, name: id, conglomerate, fgcCovered, ...stamp });
  const institutions = [institution('Banco A', 'Grupo A'), institution('Banco A2', 'Grupo A'), institution('Banco B', 'Banco B'), institution('Tesouro', 'Tesouro', false)];
  const position = (id: string, p: Partial<Position> & Pick<Position, 'assetClass' | 'instrumentType'>): Position => ({
    id, bucket: 'livre', name: id, institutionId: null, indexer: null, rate: null, startDate: null, maturityDate: null, liquidity: 'diaria', ticker: null, ...stamp, ...p,
  });
  const valuation = (positionId: string, gross: number, open = true): Valuation => ({
    positionId, family: 'amount', quantity: null, costCents: reais(gross), grossCents: reais(gross), iofCents: 0, irCents: 0, netCents: reais(gross), taxEstimated: true,
    priced: true, estimated: false, dataDate: null, lots: [], incomeCents: 0, realizedCents: 0, lastReconciliation: null, issues: [], open,
  });
  const positions = [
    position('cdb-a', { assetClass: 'rfPosFixada', instrumentType: 'CDB', institutionId: 'Banco A', maturityDate: '2028-06-15' }),
    position('lci-a2', { assetClass: 'rfPosFixada', instrumentType: 'LCI', institutionId: 'Banco A2', maturityDate: '2027-03-01' }),
    position('cdb-b', { assetClass: 'rfPrefixada', instrumentType: 'CDB', institutionId: 'Banco B', maturityDate: '2029-01-02' }),
    position('cofrinho-b', { bucket: 'reserva', assetClass: 'rfPosFixada', instrumentType: 'CDB', institutionId: 'Banco B', maturityDate: '2030-01-02' }),
    position('selic', { assetClass: 'rfPosFixada', instrumentType: 'TesouroSelic', institutionId: 'Tesouro', maturityDate: '2031-03-01' }),
    position('encerrado', { assetClass: 'rfIpcaCurta', instrumentType: 'CDB', institutionId: 'Banco B', maturityDate: '2031-05-15' }),
    position('ipca-longo', { assetClass: 'rfIpcaLonga', instrumentType: 'TesouroIPCA', institutionId: 'Tesouro', maturityDate: '2035-05-15' }),
    position('acao', { assetClass: 'acoesBrasil', instrumentType: 'Acao', ticker: 'XPTO3', liquidity: 'bolsa' }),
    position('etf', { assetClass: 'acoesBrasil', instrumentType: 'ETF', ticker: 'AMPL11', liquidity: 'bolsa' }),
    position('fii-a', { assetClass: 'fiis', instrumentType: 'FII', ticker: 'FICTA11', liquidity: 'bolsa' }),
    position('fii-b', { assetClass: 'fiis', instrumentType: 'FII', ticker: 'FICTB11', liquidity: 'bolsa' }),
    position('fii-c', { assetClass: 'fiis', instrumentType: 'FII', ticker: 'FICTC11', liquidity: 'bolsa' }),
  ];
  const valuations = new Map<string, Valuation>(
    [
      valuation('cdb-a', 150000),
      valuation('lci-a2', 60000),
      valuation('cdb-b', 50000),
      valuation('cofrinho-b', 10000),
      valuation('selic', 30000),
      valuation('encerrado', 0, false),
      valuation('ipca-longo', 20000),
      valuation('acao', 4000),
      valuation('etf', 8000),
      valuation('fii-a', 6000),
      valuation('fii-b', 3000),
      valuation('fii-c', 1000),
    ].map(v => [v.positionId, v]),
  );
  const holdings = { positions, valuations, institutions, policy: initialPolicy(NOW), today: TODAY };

  it('finds the vacant years of the medium-term ladder, 2 to 5 years ahead', () => {
    // 2028, 2029 and the Tesouro Selic's 2031 are taken; the reserve's 2030, closed positions and
    // the long term do not count.
    expect(vacantLadderYears(holdings)).toEqual([2030]);
  });

  it('sums FGC-covered balances by conglomerate, the reserve included', () => {
    expect(issuerExposures(holdings)).toEqual([
      { conglomerate: 'Grupo A', valueCents: 21_000_000, limitCents: 20_000_000 },
      { conglomerate: 'Banco B', valueCents: 6_000_000, limitCents: 20_000_000 },
    ]);
  });

  it('builds the hints of each class', () => {
    const after = byClass({ rfPosFixada: 240000, rfPrefixada: 50000, rfIpcaLonga: 20000, acoesBrasil: 12000, fiis: 12000, cripto: 2000 });
    expect(classHints('rfPrefixada', holdings, after)).toEqual([
      { kind: 'escada', years: [2030] },
      {
        kind: 'emissores',
        withRoom: [{ conglomerate: 'Banco B', valueCents: 6_000_000, limitCents: 20_000_000 }],
        full: [{ conglomerate: 'Grupo A', valueCents: 21_000_000, limitCents: 20_000_000 }],
      },
    ]);
    // R$ 4.000,00 of a single stock in a free portfolio of R$ 336.000,00 is 1,19%: within 2,86%.
    expect(classHints('acoesBrasil', holdings, after)).toEqual([]);
    const small = byClass({ acoesBrasil: 12000, fiis: 12000, cripto: 2000, rfPosFixada: 74000 });
    expect(classHints('acoesBrasil', holdings, small)).toMatchObject([{ kind: 'acoes', over: [{ positionId: 'acao', name: 'XPTO3' }], maxPct: 2.86 }]);
    // With R$ 2.000,00 more in the class, FICTA11 holds 50% of it and FICTB11 25%, the limit itself.
    const fiis = classHints('fiis', holdings, after);
    expect(fiis).toMatchObject([{ kind: 'fiis', over: [{ name: 'FICTA11' }], maxPct: 25 }]);
    expect((fiis[0] as { over: { pct: { toFixed: (n: number) => string } }[] }).over[0]!.pct.toFixed(2)).toBe('50.00');
    // No crypto yet; 5% of R$ 336.000,00 leaves room for R$ 14.800,00 after the R$ 2.000,00 planned.
    expect(classHints('cripto', holdings, after)).toEqual([{ kind: 'vazia' }, { kind: 'cripto', roomCents: reais(14800), maxPct: 5 }]);
    expect(classHints('exterior', holdings, after)).toEqual([{ kind: 'vazia' }]);
  });
});

describe('policy validation (SPEC, "Validação")', () => {
  const policy = initialPolicy(NOW, 600_000);

  it('accepts the initial policy', () => {
    expect(policyErrors(policy)).toEqual({});
  });

  it('refuses targets that do not add up to 100%', () => {
    expect(policyErrors({ ...policy, targets: { ...policy.targets, fiis: 7 } })).toEqual({ targets: 'Os alvos somam 99% e precisam somar 100%.' });
  });

  it('refuses a crypto target above its cap', () => {
    const targets = { ...policy.targets, cripto: 6, rfPosFixada: 19 };
    expect(policyErrors({ ...policy, targets })).toEqual({ cripto: 'O alvo passa do teto de cripto, de 5% da carteira livre.' });
  });

  it('refuses months that are not whole and percentages with more than two decimals', () => {
    // Still 100% in hundredths, so only the decimals are wrong.
    const targets = { ...policy.targets, fiis: 7.999, exterior: 13.001 };
    expect(policyErrors({ ...policy, reserve: { ...policy.reserve, months: 12.5 }, targets })).toEqual({
      months: 'Use um número inteiro de meses, de 0 a 60.',
      fiis: 'Use um percentual de 0 a 100, com até duas casas.',
      exterior: 'Use um percentual de 0 a 100, com até duas casas.',
    });
  });
});
