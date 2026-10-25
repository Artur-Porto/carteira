// The data routine's parsers, on small fictitious copies of each public source, and its limit for
// stale data.
import { describe, expect, it } from 'vitest';
import { STALE_AFTER_BUSINESS_DAYS, addDays, brDecimal, businessDaysBetween, normalizeDecimal } from '../../pipeline/lib';
import {
  changePoints,
  checkDailyRates,
  excelSerialToIso,
  hundredths,
  latestBonds,
  mercadoBitcoinPrices,
  mercadoBitcoinSymbols,
  mergeRows,
  parseCotahist,
  parseHolidays,
  parseSgs,
  parseTesouroCsv,
  thermometerSeries,
} from '../../pipeline/parse';
import { BusinessCalendar } from '../../src/domain/calendar';
import { STALE_AFTER_BUSINESS_DAYS as APP_STALE_AFTER_BUSINESS_DAYS } from '../../src/ui/marketStatus';

describe('numbers from the sources', () => {
  it('normalizes decimal text without floating point', () => {
    expect(normalizeDecimal('413349.00000000')).toBe('413349');
    expect(normalizeDecimal('0.10')).toBe('0.1');
    expect(normalizeDecimal('007.50')).toBe('7.5');
    expect(normalizeDecimal('-0.0')).toBe('0');
    expect(normalizeDecimal('0.00002531')).toBe('0.00002531');
    expect(brDecimal('1.234,5')).toBe('1234.5');
    expect(brDecimal('0,050788')).toBe('0.050788');
    expect(() => brDecimal('1,2,3')).toThrow();
  });

  it('reads prices as centavos and rates as hundredths of a percent', () => {
    expect(hundredths('4021,13')).toBe(402113);
    expect(hundredths('20086,8')).toBe(2008680);
    expect(hundredths('6,89')).toBe(689);
    expect(hundredths('-0,32')).toBe(-32);
    expect(hundredths('1,005')).toBe(101);
    expect(hundredths('0,00')).toBe(0);
  });
});

describe('Banco Central, SGS', () => {
  it('sorts, drops future dates and keeps the last repeated date', () => {
    const rows = parseSgs(
      [
        { data: '02/01/2026', valor: '0.050788' },
        { data: '01/01/2026', valor: '0.050700' },
        { data: '02/01/2026', valor: '0.050790' },
        { data: '31/12/2099', valor: '1.00' },
      ],
      '2026-10-19',
    );
    expect(rows).toEqual([
      ['2026-01-01', '0.0507'],
      ['2026-01-02', '0.05079'],
    ]);
    expect(() => parseSgs({ erro: 'x' }, '2026-10-19')).toThrow();
  });

  it('lets the refreshed window replace what was published', () => {
    const previous: [string, string][] = [
      ['2026-10-01', 'a'],
      ['2026-10-02', 'b'],
      ['2026-10-05', 'c'],
    ];
    const fresh: [string, string][] = [
      ['2026-10-02', 'B'],
      ['2026-10-06', 'D'],
    ];
    expect(mergeRows(previous, fresh, '2026-10-02')).toEqual([
      ['2026-10-01', 'a'],
      ['2026-10-02', 'B'],
      ['2026-10-06', 'D'],
    ]);
  });

  it('keeps only the days when the Selic target changes', () => {
    const daily: [string, string][] = [
      ['2026-01-02', '15'],
      ['2026-01-03', '15'],
      ['2026-01-04', '14.5'],
      ['2026-01-05', '14.5'],
      ['2026-01-06', '15'],
    ];
    expect(changePoints(daily, [['2025-12-10', '15']])).toEqual([
      ['2025-12-10', '15'],
      ['2026-01-04', '14.5'],
      ['2026-01-06', '15'],
    ]);
  });

  it('rejects daily rates outside a plausible range', () => {
    expect(() => checkDailyRates([['2026-10-01', '0.050788']], 'CDI')).not.toThrow();
    expect(() => checkDailyRates([['2026-10-01', '0']], 'CDI')).toThrow();
    expect(() => checkDailyRates([['2026-10-01', '13.65']], 'CDI')).toThrow();
    expect(() => checkDailyRates([], 'CDI')).toThrow();
  });
});

const TESOURO_CSV = [
  'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha',
  'Tesouro IPCA+;15/05/2035;10/10/2026;6,00;6,12;2800,00;2790,00;2790,00',
  'Tesouro IPCA+;15/05/2035;13/10/2026;7,00;7,12;2600,00;2590,00;2590,00',
  'Tesouro IPCA+;15/05/2035;14/10/2026;6,50;6,62;2700,00;2690,00;2690,00',
  'Tesouro IPCA+;15/05/2035;15/10/2026;6,50;6,62;2713,48;2686,72;2686,72',
  'Tesouro IPCA+;15/05/2029;15/10/2026;6,77;6,89;4034,07;4021,13;4021,13',
  'Tesouro Prefixado;01/01/2029;15/10/2026;0,00;12,76;0,00;768,69;768,69',
  'Tesouro Novo Fictício;01/01/2030;15/10/2026;1,00;1,10;100,00;99,00;99,00',
].join('\r\n');

describe('Tesouro Transparente', () => {
  const rows = parseTesouroCsv(TESOURO_CSV);

  it('refuses a file whose header changed', () => {
    expect(() => parseTesouroCsv(TESOURO_CSV.replace('PU Base Manha', 'PU Base'))).toThrow(/cabeçalho/);
  });

  it('publishes the latest day with the app instrument codes', () => {
    const { asOf, bonds, unknown } = latestBonds(rows, 1);
    expect(asOf).toBe('2026-10-15');
    expect(unknown).toEqual(['Tesouro Novo Fictício']);
    expect(bonds).toEqual([
      {
        type: 'TesouroIPCA',
        name: 'Tesouro IPCA+ 2029',
        maturity: '2029-05-15',
        buyRate: '6.77',
        sellRate: '6.89',
        buyPrice: 403407,
        sellPrice: 402113,
        basePrice: 402113,
      },
      {
        type: 'TesouroIPCA',
        name: 'Tesouro IPCA+ 2035',
        maturity: '2035-05-15',
        buyRate: '6.5',
        sellRate: '6.62',
        buyPrice: 271348,
        sellPrice: 268672,
        basePrice: 268672,
      },
      {
        type: 'TesouroPrefixado',
        name: 'Tesouro Prefixado 2029',
        maturity: '2029-01-01',
        buyRate: null,
        sellRate: '12.76',
        buyPrice: null,
        sellPrice: 76869,
        basePrice: 76869,
      },
    ]);
  });

  it('places today’s rate in the history of the bond closest to the target term', () => {
    const s = thermometerSeries(rows, 'Tesouro IPCA+', 10, 10);
    // The 2035 bond is closer to 10 years than the 2029 one. Of 4 days, one is below 6.50
    // and two are equal (today included): (1 + 2/2) / 4 = 50%.
    expect(s.bond).toBe('Tesouro IPCA+ 2035');
    expect(s.rate).toBe('6.5');
    expect(s.percentile).toBe(50);
    expect(s.observations).toBe(4);
    expect([s.min, s.max]).toEqual(['6', '7']);
    expect(s.monthly).toEqual([['2026-10', '6.5']]);
  });
});

/** One spot-market line of the fixed-width COTAHIST layout (245 columns). */
function cotahistLine(f: { bdi: string; ticker: string; name: string; spec: string; close: number; factor?: number; market?: string }) {
  const line = Array<string>(245).fill(' ');
  const put = (start: number, text: string) => [...text].forEach((ch, i) => (line[start + i] = ch));
  put(0, '01');
  put(2, '20261019');
  put(10, f.bdi);
  put(12, f.ticker);
  put(24, f.market ?? '010');
  put(27, f.name);
  put(39, f.spec);
  put(108, String(f.close).padStart(13, '0'));
  put(210, String(f.factor ?? 1).padStart(7, '0'));
  return line.join('');
}

describe('B3, COTAHIST', () => {
  const file = [
    '00COTAHIST.2026BOVESPA 20261019'.padEnd(245),
    cotahistLine({ bdi: '02', ticker: 'ABCD3', name: 'EMPRESA FICT', spec: 'ON      NM', close: 1234 }),
    cotahistLine({ bdi: '12', ticker: 'FICTA11', name: 'FII FICT A', spec: 'CI', close: 9876 }),
    cotahistLine({ bdi: '14', ticker: 'FICT11', name: 'FUNDO MIL', spec: 'CI *', close: 45, factor: 1000 }),
    cotahistLine({ bdi: '02', ticker: 'ABCD3F', name: 'EMPRESA FICT', spec: 'ON', close: 1235, market: '020' }),
    cotahistLine({ bdi: '10', ticker: 'ABCD1', name: 'DIREITO', spec: 'DIR', close: 10 }),
    cotahistLine({ bdi: '34', ticker: 'FICT34', name: 'BDR FICT', spec: 'DRN', close: 0 }),
    '99COTAHIST.2026BOVESPA 20261019000000007'.padEnd(245),
  ].join('\r\n');

  it('keeps stocks, FIIs, ETFs and BDRs of the spot market, with the quotation factor', () => {
    const { asOf, items, skipped } = parseCotahist(file, 1);
    expect(asOf).toBe('2026-10-19');
    expect(skipped).toBe(1);
    expect(items).toEqual([
      { ticker: 'ABCD3', kind: 'acao', name: 'EMPRESA FICT', spec: 'ON NM', close: 1234 },
      { ticker: 'FICT11', kind: 'etf', name: 'FUNDO MIL', spec: 'CI *', close: 45, factor: 1000 },
      { ticker: 'FICTA11', kind: 'fii', name: 'FII FICT A', spec: 'CI', close: 9876 },
    ]);
  });

  it('refuses a file that is not COTAHIST or mixes dates', () => {
    expect(() => parseCotahist('<html>', 1)).toThrow(/cabeçalho/);
    expect(() => parseCotahist(file.replace('01202610191', '01202610181'), 1)).toThrow(/linha de 2026-10-18/);
  });
});

describe('ANBIMA holidays', () => {
  it('reads serial dates without time-zone shifts and skips the footer', () => {
    expect(excelSerialToIso(45292)).toBe('2024-01-01');
    const rows = [['Data', 'Dia da Semana', 'Feriado'], [45292, 'segunda-feira', 'Confraternização Universal'], [45293.0], ['Fonte: ANBIMA']];
    expect(parseHolidays(rows, 1)).toEqual(['2024-01-01', '2024-01-02']);
    expect(() => parseHolidays(rows)).toThrow();
  });
});

describe('Mercado Bitcoin', () => {
  it('lists the crypto assets quoted in reais and their prices', () => {
    const symbols = {
      symbol: ['BTC-BRL', 'TOKEN07-BRL', 'ETH-BRL', 'ETH-USDT'],
      type: ['CRYPTO', 'DIGITAL_ASSET', 'CRYPTO', 'CRYPTO'],
      currency: ['BRL', 'BRL', 'BRL', 'USDT'],
      'exchange-traded': [true, true, true, true],
    };
    expect(mercadoBitcoinSymbols(symbols)).toEqual(['BTC-BRL', 'ETH-BRL']);
    const prices = mercadoBitcoinPrices([
      { pair: 'ETH-BRL', last: '12147.00000000' },
      { pair: 'BTC-BRL', last: '413349.00000000' },
      { pair: 'DEAD-BRL', last: '0.00000000' },
    ]);
    expect(prices).toEqual({ BTC: '413349', ETH: '12147' });
    expect(Object.keys(prices)).toEqual(['BTC', 'ETH']);
    expect(() => mercadoBitcoinPrices([{ pair: 'ETH-BRL', last: '1' }])).toThrow(/BTC/);
  });
});

describe('age of the published data', () => {
  it('uses the app’s limit and counts business days as the app’s calendar does', () => {
    expect(STALE_AFTER_BUSINESS_DAYS).toBe(APP_STALE_AFTER_BUSINESS_DAYS);
    const holidays = ['2026-11-02', '2026-11-20', '2026-12-25', '2027-01-01', '2027-02-08', '2027-02-09'];
    const app = new BusinessCalendar(holidays);
    for (let from = '2026-10-26'; from < '2027-02-20'; from = addDays(from, 3)) {
      for (const span of [0, 1, 2, 3, 6, 9, 12]) {
        const to = addDays(from, span);
        expect(businessDaysBetween(from, to, new Set(holidays)), `${from} a ${to}`).toBe(app.businessDaysBetween(from, to));
      }
    }
  });

  it('puts the Tesouro data of 15/10/2026 past the limit on 23/10, as the app did', () => {
    const age = (today: string) => businessDaysBetween('2026-10-15', today, new Set(['2026-10-12']));
    expect(age('2026-10-22')).toBe(STALE_AFTER_BUSINESS_DAYS);
    expect(age('2026-10-23')).toBe(STALE_AFTER_BUSINESS_DAYS + 1);
  });
});
