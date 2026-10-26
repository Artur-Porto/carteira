// Milestone 4: thermometer, scenarios on the whole patrimony, sale taxes, rebalancing, alerts and
// the monthly review. Every portfolio is fictitious; each expected value is worked out beside it.
import { describe, expect, it } from 'vitest';
import { dec } from '../../src/domain/decimal';
import { INITIAL_SCENARIOS, bandFor, initialPolicy } from '../../src/domain/policy';
import type { PortfolioValue, Totals } from '../../src/domain/portfolio';
import { marketGainTax } from '../../src/domain/tax';
import { ASSET_CLASSES, type AssetClass, type DecisionLog, type PensionPlan, type Policy, type Position, type Transaction } from '../../src/domain/types';
import type { Valuation } from '../../src/domain/valuation';
import { alerts, intentionReady } from '../../src/engine/alerts';
import { planContribution } from '../../src/engine/plan';
import { rebalance } from '../../src/engine/rebalance';
import { reviewStatus } from '../../src/engine/review';
import { lossCents, patrimonyWeights, scenarioResults, worstScenario } from '../../src/engine/scenarios';
import { effectiveTargets } from '../../src/engine/thermometer';
import type { ThermometerFile } from '../../src/market/files';

const NOW = '2026-10-25T12:00:00.000Z';
const TODAY = '2026-10-25';
const stamp = { createdAt: NOW, updatedAt: NOW };
const reais = (value: number) => Math.round(value * 100);
type Values = Partial<Record<AssetClass, number>>;
const byClass = (values: Values) => Object.fromEntries(ASSET_CLASSES.map(c => [c, reais(values[c] ?? 0)])) as Record<AssetClass, number>;

function thermometer(ipca: number, pre: number): ThermometerFile {
  const series = (bond: string, percentile: number) => ({ bond, maturity: '2035-05-15', targetYears: 10, rate: '6.84', percentile, observations: 2489, since: '2016-10-14', min: '1', max: '9', monthly: [] });
  return { version: 1, asOf: '2026-10-15', lookbackYears: 10, series: { rfIpcaLonga: series('Tesouro IPCA+ 2035', ipca), rfPrefixada: series('Tesouro Prefixado 2029', pre) } } as ThermometerFile;
}

describe('rate thermometer (SPEC, "Termômetro de taxas")', () => {
  const policy = initialPolicy(NOW);

  it('moves both targets up by half of their bands, from the CDI class, and the worst scenario goes to 18,91%', () => {
    const e = effectiveTargets(policy, thermometer(81.5, 80));
    // IPCA+ longa: band 13,5 to 22,5, half of 4,5 is 2,25. Prefixada: band 6 to 10, half of 2 is 1.
    expect(e.targets).toMatchObject({ rfIpcaLonga: 20.25, rfPrefixada: 9, rfPosFixada: 18.75 });
    expect(ASSET_CLASSES.reduce((s, c) => s + Math.round(e.targets[c] * 100), 0)).toBe(10_000);
    expect(e.bands.rfIpcaLonga).toEqual(bandFor(20.25));
    const weights = Object.fromEntries(ASSET_CLASSES.map(c => [c, dec(e.targets[c])]));
    expect(worstScenario(scenarioResults(weights, INITIAL_SCENARIOS))!.pct.toFixed(2)).toBe('-18.91');
  });

  it('moves down at the 25th percentile and stays in between', () => {
    const e = effectiveTargets(policy, thermometer(50, 25));
    expect(e.targets).toMatchObject({ rfIpcaLonga: 18, rfPrefixada: 7, rfPosFixada: 23 });
    expect(e.tilts.map(t => t.shiftPct)).toEqual([0, -1]);
  });

  it('does nothing when turned off or without readings', () => {
    expect(effectiveTargets({ ...policy, tiltEnabled: false }, thermometer(90, 90))).toMatchObject({ targets: policy.targets, applied: false });
    expect(effectiveTargets(policy, undefined)).toMatchObject({ targets: policy.targets, applied: false });
  });
});

describe('scenarios on the whole patrimony (SPEC: reserve without shock, pension by composition)', () => {
  it('weighs free portfolio, reserve and pension', () => {
    // Free portfolio at the targets, R$ 100.000,00; reserve R$ 50.000,00; pension R$ 50.000,00.
    const free = byClass(Object.fromEntries(ASSET_CLASSES.map(c => [c, initialPolicy(NOW).targets[c] * 1000])));
    const w = patrimonyWeights({ freeByClass: free, reserveCents: reais(50000), pensions: [{ cents: reais(50000), composition: { rfPosFixada: 60, rfIpcaLonga: 15, acoesBrasil: 10, creditoPrivado: 15 } }] });
    expect(w.totalCents).toBe(reais(200000));
    // Crise global: -18,38% of R$ 100.000,00 is -R$ 18.380,00; the pension loses 8,75% of
    // R$ 50.000,00, -R$ 4.375,00; together -R$ 22.755,00, or -11,3775% of R$ 200.000,00.
    expect(scenarioResults(w.weights, INITIAL_SCENARIOS)[0]!.pct.toFixed(4)).toBe('-11.3775');
    expect(lossCents(scenarioResults(w.weights, INITIAL_SCENARIOS)[0]!, w.totalCents)).toBe(-reais(22755));
  });

  it('counts a pension without composition with no shock, and says so', () => {
    const w = patrimonyWeights({ freeByClass: byClass({ acoesBrasil: 100 }), reserveCents: 0, pensions: [{ cents: reais(100), composition: {} }] });
    expect(w.pensionWithoutCompositionCents).toBe(reais(100));
    expect(scenarioResults(w.weights, INITIAL_SCENARIOS)[0]!.pct.toFixed(2)).toBe('-25.00');
  });
});

describe('income tax on sales (official sources in docs/marco-4.md)', () => {
  it('exempts stocks while the month sells up to R$ 20 mil, and taxes 15% above it', () => {
    expect(marketGainTax('acao', reais(1000), reais(20000))).toBe(0);
    expect(marketGainTax('acao', reais(1000), reais(20000.01))).toBe(reais(150));
  });

  it('taxes ETFs and BDRs at 15% and FIIs at 20%, without exemption, and never a loss', () => {
    expect(marketGainTax('etf', reais(1000), reais(100))).toBe(reais(150));
    expect(marketGainTax('fii', reais(1000), reais(100))).toBe(reais(200));
    expect(marketGainTax('fii', reais(-500), reais(100))).toBe(0);
  });

  it('exempts crypto up to R$ 35 mil of monthly sales and taxes the gain by bracket above it', () => {
    expect(marketGainTax('cripto', reais(1000), reais(35000))).toBe(0);
    expect(marketGainTax('cripto', reais(1000), reais(35000.01))).toBe(reais(150));
    // R$ 6 milhões of gain: 15% of R$ 5 milhões plus 17,5% of R$ 1 milhão.
    expect(marketGainTax('cripto', reais(6_000_000), reais(9_000_000))).toBe(reais(925_000));
  });
});

const position = (id: string, p: Partial<Position> & Pick<Position, 'assetClass' | 'instrumentType'>): Position => ({
  id, bucket: 'livre', name: id, institutionId: null, indexer: null, rate: null, startDate: null, maturityDate: null, liquidity: 'bolsa', ticker: null, ...stamp, ...p,
});
const valuation = (positionId: string, gross: number, cost: number, net = gross): Valuation => ({
  positionId, family: 'market', quantity: null, costCents: reais(cost), grossCents: reais(gross), iofCents: 0, irCents: reais(gross - net), netCents: reais(net), taxEstimated: false,
  priced: true, estimated: false, dataDate: null, lots: [], incomeCents: 0, realizedCents: 0, lastReconciliation: null, issues: [], open: true,
});
const tx = (positionId: string, date: string, amount: number): Transaction => ({ id: `${positionId}-${date}`, date, type: 'sell', positionId, amountCents: reais(amount), quantity: '1', feesCents: 0, note: '', ...stamp });

describe('rebalancing (SPEC: contributions first, a sale only past 6 months)', () => {
  const policy = initialPolicy(NOW);
  // R$ 100.000,00: pós 40.000 (band 17-27), ações 20.000 (9-15), cripto 6.000 (2,25-3,75),
  // IPCA+ curta 5.000 (12-20), exterior 0 (9,75-16,25); the rest within their bands.
  const values = byClass({ rfPosFixada: 40000, acoesBrasil: 20000, cripto: 6000, rfIpcaCurta: 5000, rfIpcaLonga: 15000, rfPrefixada: 6000, fiis: 8000, exterior: 0 });
  const positions = [
    position('cdb', { assetClass: 'rfPosFixada', instrumentType: 'CDB', liquidity: 'vencimento' }),
    position('acao', { assetClass: 'acoesBrasil', instrumentType: 'Acao', ticker: 'XPTO3' }),
    position('etf', { assetClass: 'acoesBrasil', instrumentType: 'ETF', ticker: 'AMPL11' }),
    position('btc', { assetClass: 'cripto', instrumentType: 'Cripto', ticker: 'BTC' }),
  ];
  const valuations = new Map<string, Valuation>([
    ['cdb', valuation('cdb', 40000, 35000, 39000)],
    ['acao', valuation('acao', 8000, 6000)],
    ['etf', valuation('etf', 12000, 12500)],
    ['btc', valuation('btc', 6000, 2000)],
  ]);
  const base = { byClass: values, targets: policy.targets, bands: policy.bands, monthlyContributionCents: reais(2000), positions, valuations, today: TODAY };

  it('gives the months of contributions and the sale for what they do not fix in 6', () => {
    const result = rebalance({ ...base, transactions: [] });
    const of = (cls: AssetClass) => result.find(r => r.assetClass === cls)!;
    expect(result.map(r => [r.assetClass, r.status, r.months])).toEqual([
      // 40.000 <= 27% of (100.000 + 2.000n) needs n >= 24,07.
      ['rfPosFixada', 'acima', 25],
      // 5.000 + x >= 12% of (100.000 + x): x >= 7.954,55, four contributions.
      ['rfIpcaCurta', 'abaixo', 4],
      // 20.000 <= 15% of (100.000 + 2.000n): n >= 16,67.
      ['acoesBrasil', 'acima', 17],
      // 9,75% of (100.000 + x) with x: x >= 10.803,32, six contributions.
      ['exterior', 'abaixo', 6],
      // 6.000 <= 3,75% of (100.000 + 2.000n): n >= 30.
      ['cripto', 'acima', 30],
    ]);
    // Fixed income never sells: 40.000 - 27% of 112.000 = 9.760,00 would leave 1.000,00 of tax
    // on 40.000,00, so 244,00.
    expect(of('rfPosFixada')).toMatchObject({ fixedIncome: true, sale: null, redeemCostCents: reais(244) });
    // 20.000 - 15% of 112.000 = 3.200,00, from the ETF at a loss first: no tax.
    expect(of('acoesBrasil').sale).toMatchObject({ amountCents: reais(3200), taxCents: 0, monthSales: [] });
    expect(of('acoesBrasil').sale!.chunks).toEqual([{ positionId: 'etf', name: 'AMPL11', kind: 'etf', amountCents: reais(3200), costCents: 333_333, gainCents: -13_333 }]);
    // 6.000 - 3,75% of 112.000 = 1.800,00 of bitcoin, R$ 1.200,00 of gain, within R$ 35 mil.
    expect(of('cripto').sale).toMatchObject({ amountCents: reais(1800), taxCents: 0 });
    expect(of('cripto').sale!.monthSales).toEqual([{ kind: 'cripto', soFarCents: 0, withSaleCents: reais(1800), exemptCents: reais(35000) }]);
  });

  it('counts the month\'s earlier sales against the exemption', () => {
    const result = rebalance({ ...base, transactions: [tx('btc', '2026-10-05', 34000), tx('btc', '2026-09-30', 50000)] });
    // 34.000 sold this month plus 1.800: past R$ 35 mil, 15% of 1.200,00.
    expect(result.find(r => r.assetClass === 'cripto')!.sale).toMatchObject({ taxCents: reais(180), monthSales: [{ soFarCents: reais(34000), withSaleCents: reais(35800) }] });
  });

  it('suggests no sale without a planned monthly contribution', () => {
    const result = rebalance({ ...base, monthlyContributionCents: 0, transactions: [] });
    expect(result.every(r => r.sale === null && r.months === null)).toBe(true);
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

describe('contribution with the worst scenario past the tolerance', () => {
  it('gives nothing to the class that weighs most in it', () => {
    const base = initialPolicy(NOW, 600_000);
    const policy: Policy = {
      ...base,
      reserve: { ...base.reserve, months: 0 },
      targets: { rfPosFixada: 50, rfIpcaCurta: 3, rfPrefixada: 0, rfIpcaLonga: 4, acoesBrasil: 30, fiis: 4, exterior: 4, cripto: 5 },
      maxDrawdown: 15,
    };
    // Crise global loses 19,12% today; Ações Brasil, 12,5 points of it, also has the largest shortfall.
    const values: Values = { rfPosFixada: 55000, acoesBrasil: 25000, cripto: 5000, rfIpcaCurta: 3000, rfIpcaLonga: 4000, fiis: 4000, exterior: 4000 };
    const plan = planContribution({ amountCents: reais(5000), today: TODAY, policy, value: portfolio(0, values), positions: [], institutions: [] });
    expect(plan.excluded).toBe('acoesBrasil');
    expect(plan.classes.map(c => c.assetClass)).not.toContain('acoesBrasil');
    expect(plan.classes.reduce((s, c) => s + c.amountCents, 0)).toBe(reais(5000));
  });
});

describe('alerts (SPEC, "Alertas")', () => {
  const policy = initialPolicy(NOW, 600_000);
  const plan: PensionPlan = {
    id: 'pgbl', name: 'PGBL fictício', startDate: '2024-11-10', ownMonthlyCents: 0, matchPct: 100,
    vestingTable: [{ years: 2, pct: 20 }], balances: [{ date: '2026-09-30', ownCents: reais(1000), companyCents: reais(1000) }],
    composition: {}, fees: { adminPct: 0, loadingPct: 0 }, taxRegime: 'regressivo', ...stamp,
  };
  const positions = [
    position('cofrinho', { bucket: 'reserva', assetClass: 'rfPosFixada', instrumentType: 'CDB', indexer: 'CDI', rate: '95', liquidity: 'diaria', name: 'Cofrinho fictício' }),
    position('cdb', { assetClass: 'rfPosFixada', instrumentType: 'CDB', maturityDate: '2026-11-20', liquidity: 'vencimento', name: 'CDB fictício' }),
    position('acao', { assetClass: 'acoesBrasil', instrumentType: 'Acao', ticker: 'XPTO3' }),
  ];
  const valuations = new Map<string, Valuation>([
    ['cofrinho', valuation('cofrinho', 10000, 10000)],
    ['cdb', valuation('cdb', 50000, 50000)],
    ['acao', valuation('acao', 50000, 40000)],
  ]);
  const intent = (id: string, createdAt: string): DecisionLog => ({
    id, date: createdAt.slice(0, 10), type: 'venda', reason: 'Quero reduzir', wouldChangeIf: '', relatedIds: ['acao'],
    saleIntent: { outcome: 'pendente' }, createdAt, updatedAt: createdAt,
  });

  it('lists what needs attention, the most serious first', () => {
    const list = alerts({
      today: TODAY,
      now: new Date(NOW),
      policy,
      value: portfolio(10000, { rfPosFixada: 50000, acoesBrasil: 50000 }, valuations),
      positions,
      institutions: [],
      pensionPlans: [plan],
      decisionLogs: [intent('antiga', '2026-10-21T12:00:00.000Z'), intent('nova', '2026-10-24T12:00:00.000Z')],
      theses: [{ id: 'tese', positionId: 'acao', text: 'Tese', reviewDate: '2026-10-01', ...stamp }],
    });
    expect(list.map(a => a.kind)).toEqual([
      'piorCenario', // 50% in stocks: -25% in the global crisis
      'reservaAbaixoDaMeta',
      'vencimento',
      'classeForaDaFaixa',
      'classeForaDaFaixa',
      'classeForaDaFaixa',
      'classeForaDaFaixa',
      'classeForaDaFaixa',
      'classeForaDaFaixa',
      'classeForaDaFaixa',
      'classeForaDaFaixa',
      'reservaAbaixoDoPiso',
      'carencia',
      'intencaoDeVenda',
      'tese',
    ]);
    expect(list[2]).toMatchObject({ name: 'CDB fictício', days: 26 });
    expect(list.find(a => a.kind === 'carencia')).toMatchObject({ date: '2026-11-10', pct: 20, days: 16 });
    expect(list.find(a => a.kind === 'intencaoDeVenda')).toMatchObject({ logId: 'antiga', name: 'XPTO3' });
  });

  it('lets a sale intention mature after 72 hours', () => {
    expect(intentionReady(intent('a', '2026-10-22T12:00:00.000Z'), new Date(NOW))).toBe(true);
    expect(intentionReady(intent('b', '2026-10-22T12:00:01.000Z'), new Date(NOW))).toBe(false);
  });
});

describe('monthly review (SPEC, "Revisão mensal")', () => {
  it('finds each step done from the records', () => {
    const cofrinho = position('cofrinho', { bucket: 'reserva', assetClass: 'rfPosFixada', instrumentType: 'CDB', liquidity: 'diaria' });
    const selic = position('selic', { bucket: 'reserva', assetClass: 'rfPosFixada', instrumentType: 'TesouroSelic', liquidity: 'diaria' });
    const status = reviewStatus({
      today: TODAY,
      positions: [cofrinho, selic],
      valuations: new Map([['cofrinho', valuation('cofrinho', 1, 1)], ['selic', valuation('selic', 1, 1)]]),
      reconciliations: [{ id: 'r', positionId: 'cofrinho', date: '2026-09-30', balanceCents: 100, ...stamp }],
      pensionPlans: [],
      transactions: [tx('cofrinho', '2026-10-02', 10)],
      contributionPlans: [{ id: 'p', date: '2026-10-05', amountCents: 100, splits: [], status: 'done', ...stamp }],
      decisionLogs: [
        { id: 'd', date: '2026-10-05', type: 'aporte', reason: 'r', wouldChangeIf: '', relatedIds: [], ...stamp },
        { id: 'v', date: '2026-10-06', type: 'venda', reason: 'r', wouldChangeIf: '', relatedIds: [], saleIntent: { outcome: 'pendente' }, ...stamp },
      ],
    });
    // The Tesouro Selic is valued by price, so only the cofrinho needs the bank balance.
    expect(status).toMatchObject({ month: '2026-10', reserveBalances: { updated: 1, total: 1 }, lastMovement: '2026-10-02', decisions: 1, closed: null });
    expect(status.plan?.id).toBe('p');
  });
});
