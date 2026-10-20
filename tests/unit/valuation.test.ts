// Reference cases of milestone 2 (SPEC: "Saldos batem com os casos de referência"). The expected
// numbers come from an independent implementation of the same rules, written in Python with its
// decimal module, and are explained in docs/marco-2.md. Every position here is fictitious.
import { describe, expect, it } from 'vitest';
import { BusinessCalendar, addDays } from '../../src/domain/calendar';
import { buildMarket, type MarketFiles } from '../../src/domain/market';
import { reserveMonths, valuePortfolio } from '../../src/domain/portfolio';
import type { Position, Reconciliation, Transaction } from '../../src/domain/types';
import { valuePosition } from '../../src/domain/valuation';

/** National holidays of 2024 to 2027, as in the ANBIMA list. */
const HOLIDAYS = [
  '2024-01-01', '2024-02-12', '2024-02-13', '2024-03-29', '2024-04-21', '2024-05-01', '2024-05-30', '2024-09-07',
  '2024-10-12', '2024-11-02', '2024-11-15', '2024-11-20', '2024-12-25', '2025-01-01', '2025-03-03', '2025-03-04',
  '2025-04-18', '2025-04-21', '2025-05-01', '2025-06-19', '2025-09-07', '2025-10-12', '2025-11-02', '2025-11-15',
  '2025-11-20', '2025-12-25', '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01',
  '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25', '2027-01-01',
  '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27', '2027-09-07', '2027-10-12',
  '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25',
];

/** The same CDI on every business day from `from` through `through`: 0.050788% a day, about 13.65% a year. */
function constantRate(from: string, through: string, rate = '0.050788'): [string, string][] {
  return [...new BusinessCalendar(HOLIDAYS).businessDays(from, addDays(through, 1))].map(d => [d, rate]);
}

function files(cdiUntil = '2027-12-31'): MarketFiles {
  const rows = constantRate('2024-01-02', cdiUntil);
  return {
    holidays: { version: 1, asOf: '2026-10-19', dates: HOLIDAYS },
    indices: {
      version: 1,
      asOf: rows.at(-1)![0],
      cdi: rows,
      selic: rows,
      selicTarget: [],
      ipca: [
        ['2026-01', '0.33'],
        ['2026-02', '0.7'],
        ['2026-03', '0.56'],
      ],
      ptax: [],
    },
    treasury: {
      version: 1,
      asOf: '2026-10-15',
      bonds: [
        { type: 'TesouroIPCA', name: 'Tesouro IPCA+ 2035', maturity: '2035-05-15', buyRate: '6.84', sellRate: '6.96', buyPrice: 271348, sellPrice: 268672, basePrice: 268672 },
        { type: 'TesouroPrefixado', name: 'Tesouro Prefixado 2029', maturity: '2029-01-01', buyRate: '12.64', sellRate: '12.76', buyPrice: 77085, sellPrice: 76869, basePrice: 76869 },
      ],
    },
    b3: { version: 1, asOf: '2026-10-19', items: [{ ticker: 'ABCD3', kind: 'acao', name: 'EMPRESA FICT', spec: 'ON NM', close: 1300 }] },
    crypto: { version: 1, asOf: '2026-10-19', source: 'mercadobitcoin', prices: { BTC: '400000' } },
  };
}
const market = buildMarket(files());
const STAMP = { createdAt: '2026-10-19T12:00:00.000Z', updatedAt: '2026-10-19T12:00:00.000Z' };

function position(draft: Partial<Position> & Pick<Position, 'instrumentType'>): Position {
  return {
    id: 'pos',
    bucket: 'livre',
    assetClass: 'rfPosFixada',
    name: 'Posição fictícia',
    institutionId: null,
    indexer: null,
    rate: null,
    startDate: null,
    maturityDate: null,
    liquidity: 'diaria',
    ticker: null,
    ...STAMP,
    ...draft,
  };
}

let seq = 0;
function tx(draft: Pick<Transaction, 'date' | 'type' | 'amountCents'> & Partial<Transaction>): Transaction {
  return { id: `tx-${++seq}`, positionId: 'pos', quantity: null, feesCents: 0, note: '', ...STAMP, ...draft };
}

const cdb = (rate: string) => position({ instrumentType: 'CDB', indexer: 'CDI', rate });

describe('CDB at 100% and 110% of the CDI (SPEC, mandatory test)', () => {
  // R$ 10.000,00 applied on 2025-01-06. Bracket boundaries: 180 days pays 22.5% and 181 pays 20%
  // on the same balance, since both dates fall on a weekend.
  const cases = [
    ['100', 1, '2025-01-07', 1_000_508, 488, 5, 1_000_015],
    ['100', 30, '2025-02-05', 1_011_233, 0, 2_527, 1_008_706],
    ['100', 180, '2025-07-05', 1_064_985, 0, 14_622, 1_050_363],
    ['100', 181, '2025-07-06', 1_064_985, 0, 12_997, 1_051_988],
    ['100', 361, '2026-01-02', 1_135_346, 0, 23_686, 1_111_660],
    ['100', 721, '2026-12-28', 1_285_743, 0, 42_861, 1_242_882],
    ['110', 1, '2025-01-07', 1_000_559, 537, 5, 1_000_017],
    ['110', 30, '2025-02-05', 1_012_363, 0, 2_782, 1_009_581],
    ['110', 180, '2025-07-05', 1_071_710, 0, 16_135, 1_055_575],
    ['110', 181, '2025-07-06', 1_071_710, 0, 14_342, 1_057_368],
    ['110', 361, '2026-01-02', 1_149_846, 0, 26_223, 1_123_623],
    ['110', 721, '2026-12-28', 1_318_459, 0, 47_769, 1_270_690],
  ] as const;

  it.each(cases)('%s%% of the CDI for %i days: gross, IOF, income tax and net', (rate, days, on, gross, iof, ir, net) => {
    const v = valuePosition(cdb(rate), [tx({ date: '2025-01-06', type: 'deposit', amountCents: 1_000_000 })], [], market, on);
    expect(v.lots[0]!.days).toBe(days);
    expect([v.grossCents, v.iofCents, v.irCents, v.netCents]).toEqual([gross, iof, ir, net]);
    expect(v.costCents).toBe(1_000_000);
    expect(v.priced && !v.estimated).toBe(true);
  });

  it('repeats the last published rate for the days not out yet, and says so', () => {
    const late = buildMarket(files('2025-06-30'));
    const v = valuePosition(cdb('110'), [tx({ date: '2025-01-06', type: 'deposit', amountCents: 1_000_000 })], [], late, '2025-07-05');
    expect(v.grossCents).toBe(1_071_710);
    expect(v.estimated).toBe(true);
    expect(v.dataDate).toBe('2025-06-30');
  });

  it('values at cost what the rate history does not cover', () => {
    const v = valuePosition(cdb('100'), [tx({ date: '2023-06-01', type: 'deposit', amountCents: 1_000_000 })], [], market, '2025-01-06');
    expect(v.grossCents).toBe(1_000_000);
    expect(v.priced).toBe(false);
    expect(v.issues).toContain('sem-historico');
  });

  it('stops accruing at maturity and asks for the redemption', () => {
    const p = position({ instrumentType: 'CDB', indexer: 'CDI', rate: '100', maturityDate: '2025-07-05' });
    const v = valuePosition(p, [tx({ date: '2025-01-06', type: 'deposit', amountCents: 1_000_000 })], [], market, '2026-01-02');
    expect(v.grossCents).toBe(1_064_985);
    expect(v.issues).toContain('vencida');
  });

  it('exempts LCA from income tax and IOF', () => {
    const lca = position({ instrumentType: 'LCA', indexer: 'CDI', rate: '100' });
    const v = valuePosition(lca, [tx({ date: '2025-01-06', type: 'deposit', amountCents: 1_000_000 })], [], market, '2025-01-07');
    expect([v.grossCents, v.iofCents, v.irCents, v.netCents]).toEqual([1_000_508, 0, 0, 1_000_508]);
  });
});

describe('cofrinho with a withdrawal and a reconciliation', () => {
  const cofrinho = position({ bucket: 'reserva', instrumentType: 'CDB', indexer: 'CDI', rate: '100' });
  const movements = [
    tx({ date: '2025-03-10', type: 'deposit', amountCents: 100_000 }),
    tx({ date: '2025-06-02', type: 'deposit', amountCents: 100_000 }),
    tx({ date: '2025-09-01', type: 'withdraw', amountCents: 150_000 }),
  ];

  it('takes a withdrawal from the oldest money first', () => {
    // On 2025-09-01 the lots were worth R$ 1.063,36 and R$ 1.033,03: the first leaves whole and
    // R$ 436,64 of the second leaves too, so R$ 577,32 of what was applied is left.
    const v = valuePosition(cofrinho, movements, [], market, '2025-09-01');
    expect(v.lots.map(l => [l.date, l.costCents])).toEqual([['2025-06-02', 57_732]]);
    expect(v.realizedCents).toBe(7_732);
  });

  it('follows the bank balance from the reconciliation on, lot by lot', () => {
    // The bank showed R$ 0,50 more than the estimate of R$ 616,09 on 2025-12-01.
    const rec: Reconciliation = { id: 'rec', positionId: 'pos', date: '2025-12-01', balanceCents: 61_659, ...STAMP };
    const atReconciliation = valuePosition(cofrinho, movements, [rec], market, '2025-12-01');
    expect(atReconciliation.grossCents).toBe(61_659);
    expect(atReconciliation.lastReconciliation).toEqual({ date: '2025-12-01', balanceCents: 61_659, differenceCents: 50 });
    const later = valuePosition(cofrinho, movements, [rec], market, '2026-03-02');
    expect([later.grossCents, later.irCents, later.netCents]).toEqual([63_599, 1_173, 62_426]);
  });

  it('closes the position on a bank balance of zero and starts over from a later one', () => {
    const zero: Reconciliation = { id: 'zero', positionId: 'pos', date: '2025-12-01', balanceCents: 0, ...STAMP };
    expect(valuePosition(cofrinho, movements, [zero], market, '2025-12-02')).toMatchObject({ open: false, grossCents: 0 });
    const again: Reconciliation = { id: 'again', positionId: 'pos', date: '2026-01-05', balanceCents: 50_000, ...STAMP };
    const v = valuePosition(cofrinho, movements, [zero, again], market, '2026-01-05');
    expect(v.lots.map(l => [l.date, l.costCents, l.grossCents])).toEqual([['2026-01-05', 50_000, 50_000]]);
  });

  it('flags a withdrawal larger than the balance', () => {
    const v = valuePosition(cofrinho, [...movements, tx({ date: '2025-09-02', type: 'withdraw', amountCents: 100_000 })], [], market, '2025-10-01');
    expect(v.open).toBe(false);
    expect(v.issues).toContain('saida-maior');
  });
});

describe('Tesouro IPCA+ and Prefixado at the day’s price (SPEC, mandatory test)', () => {
  it('values each lot at the unit price and sells the oldest units first', () => {
    const p = position({ assetClass: 'rfIpcaLonga', instrumentType: 'TesouroIPCA', indexer: 'IPCA', maturityDate: '2035-05-15' });
    const v = valuePosition(
      p,
      [
        tx({ date: '2025-04-14', type: 'buy', amountCents: 520_000, quantity: '2' }),
        tx({ date: '2025-09-10', type: 'buy', amountCents: 230_000, quantity: '0.85' }),
        tx({ date: '2026-01-15', type: 'sell', amountCents: 265_000, quantity: '1' }),
      ],
      [],
      market,
      '2026-10-15',
    );
    expect(v.lots.map(l => [l.date, l.quantity!.toString(), l.costCents, l.grossCents, l.days, l.irCents])).toEqual([
      ['2025-04-14', '1', 260_000, 268_672, 549, 1_518],
      ['2025-09-10', '0.85', 230_000, 228_371, 400, 0],
    ]);
    expect([v.grossCents, v.irCents, v.netCents, v.realizedCents]).toEqual([497_043, 1_518, 495_525, 5_000]);
    expect(v.quantity!.toString()).toBe('1.85');
    expect(v.dataDate).toBe('2026-10-15');
  });

  it('values a prefixado and taxes it by holding period', () => {
    const p = position({ assetClass: 'rfPrefixada', instrumentType: 'TesouroPrefixado', indexer: 'PRE', maturityDate: '2029-01-01' });
    const v = valuePosition(p, [tx({ date: '2026-02-05', type: 'buy', amountCents: 500_000, quantity: '6.9' })], [], market, '2026-10-15');
    expect([v.grossCents, v.lots[0]!.days, v.irCents, v.netCents]).toEqual([530_396, 252, 6_079, 524_317]);
  });

  it('values at cost a bond without a price and one without a quantity', () => {
    const p = position({ instrumentType: 'TesouroPrefixado', indexer: 'PRE', maturityDate: '2031-01-01' });
    const v = valuePosition(p, [tx({ date: '2026-02-05', type: 'buy', amountCents: 500_000, quantity: '6.9' })], [], market, '2026-10-15');
    expect([v.grossCents, v.priced, v.issues]).toEqual([500_000, false, ['sem-preco']]);
    const noQty = valuePosition(p, [tx({ date: '2026-02-05', type: 'buy', amountCents: 500_000 })], [], market, '2026-10-15');
    expect(noQty.issues).toContain('sem-quantidade');
  });
});

describe('stocks at average cost', () => {
  it('keeps the average cost on a sale and prices the rest at the close', () => {
    const p = position({ assetClass: 'acoesBrasil', instrumentType: 'Acao', liquidity: 'bolsa', ticker: 'abcd3' });
    const v = valuePosition(
      p,
      [
        tx({ date: '2026-01-05', type: 'buy', amountCents: 100_000, quantity: '100', feesCents: 500 }),
        tx({ date: '2026-02-05', type: 'buy', amountCents: 120_000, quantity: '100', feesCents: 500 }),
        tx({ date: '2026-03-05', type: 'sell', amountCents: 70_000, quantity: '50', feesCents: 250 }),
        tx({ date: '2026-04-15', type: 'income', amountCents: 1_234 }),
      ],
      [],
      market,
      '2026-10-19',
    );
    expect(v.quantity!.toString()).toBe('150');
    expect([v.costCents, v.realizedCents, v.grossCents, v.incomeCents]).toEqual([165_750, 14_500, 195_000, 1_234]);
    expect(v.taxEstimated).toBe(false);
    expect(v.netCents).toBe(v.grossCents);
  });

  it('prices crypto in reais and values an unknown ticker at cost', () => {
    const btc = position({ assetClass: 'cripto', instrumentType: 'Cripto', liquidity: 'bolsa', ticker: 'BTC' });
    const v = valuePosition(btc, [tx({ date: '2026-01-05', type: 'buy', amountCents: 200_000, quantity: '0.005' })], [], market, '2026-10-19');
    expect(v.grossCents).toBe(200_000);
    expect(v.priced).toBe(true);
    const fii = position({ assetClass: 'fiis', instrumentType: 'FII', liquidity: 'bolsa', ticker: 'FICTA11' });
    const w = valuePosition(fii, [tx({ date: '2026-01-05', type: 'buy', amountCents: 300_000, quantity: '30' })], [], market, '2026-10-19');
    expect([w.grossCents, w.priced, w.issues]).toEqual([300_000, false, ['sem-preco']]);
  });
});

describe('bank fixed income at a fixed rate and at IPCA plus a real rate', () => {
  it('compounds a fixed rate over business days', () => {
    const p = position({ assetClass: 'rfPrefixada', instrumentType: 'CDB', indexer: 'PRE', rate: '12.30', liquidity: 'vencimento' });
    const v = valuePosition(p, [tx({ date: '2026-02-05', type: 'deposit', amountCents: 1_000_000 })], [], market, '2026-10-15');
    expect(v.grossCents).toBe(1_082_396);
  });

  it('spreads the IPCA over the days of each month and estimates the months not published', () => {
    const p = position({ assetClass: 'rfIpcaCurta', instrumentType: 'CDB', indexer: 'IPCA', rate: '7.00', liquidity: 'vencimento' });
    const deposit = [tx({ date: '2026-01-15', type: 'deposit', amountCents: 1_000_000 })];
    const march = valuePosition(p, deposit, [], market, '2026-03-20');
    expect([march.grossCents, march.estimated]).toEqual([1_024_309, false]);
    const may = valuePosition(p, deposit, [], market, '2026-05-10');
    expect([may.grossCents, may.estimated]).toEqual([1_043_151, true]);
  });
});

describe('portfolio totals', () => {
  it('splits the reserve from the free portfolio and counts months of reserve', () => {
    const reserve = position({ id: 'r', bucket: 'reserva', instrumentType: 'CDB', indexer: 'CDI', rate: '100' });
    const stock = position({ id: 's', assetClass: 'acoesBrasil', instrumentType: 'Acao', liquidity: 'bolsa', ticker: 'ABCD3' });
    const value = valuePortfolio({
      positions: [reserve, stock],
      transactions: [
        tx({ positionId: 'r', date: '2025-01-06', type: 'deposit', amountCents: 1_000_000 }),
        tx({ positionId: 's', date: '2026-01-05', type: 'buy', amountCents: 100_000, quantity: '100' }),
      ],
      reconciliations: [],
      pensionPlans: [],
      market,
      today: '2026-01-02',
    });
    expect(value.reserve).toEqual({ costCents: 1_000_000, grossCents: 1_135_346, netCents: 1_111_660 });
    expect(value.free.grossCents).toBe(130_000);
    expect(value.byClass.acoesBrasil.grossCents).toBe(130_000);
    expect(reserveMonths(value.reserve.netCents, 600_000)).toBe(1.8);
    expect(reserveMonths(value.reserve.netCents, 0)).toBeNull();
  });
});
