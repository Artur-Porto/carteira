// Pure parsers for each public source. They throw when a source changes its format, so the
// routine keeps the previous file instead of publishing something wrong.
import type { B3Item, B3Kind, ThermometerSeries, TreasuryBond, TreasuryType } from '../src/market/files.ts';
import { TREASURY_TYPES } from '../src/market/files.ts';
import { addDays, brDecimal, brToIso, normalizeDecimal, type IsoDate } from './lib.ts';

export type Row = [string, string];

// ---------- Banco Central, SGS ----------

/** SGS answer `[{"data":"dd/mm/aaaa","valor":"0.050788"}]` as sorted rows, without future dates. */
export function parseSgs(json: unknown, today: IsoDate): Row[] {
  if (!Array.isArray(json)) throw new Error('SGS: resposta não é uma lista');
  const byDate = new Map<string, string>();
  for (const item of json as { data?: unknown; valor?: unknown }[]) {
    if (typeof item?.data !== 'string' || typeof item.valor !== 'string') throw new Error('SGS: item sem data ou valor');
    const date = brToIso(item.data);
    if (date > today) continue;
    byDate.set(date, normalizeDecimal(item.valor.trim()));
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Keeps the old rows before `from` and takes the fresh ones from `from` on, so revisions win. */
export function mergeRows(previous: Row[], fresh: Row[], from: string): Row[] {
  return [...previous.filter(r => r[0] < from), ...fresh.filter(r => r[0] >= from)];
}

/** Collapses a daily series into the rows where the value changes. */
export function changePoints(rows: Row[], previous: Row[] = []): Row[] {
  const out = [...previous];
  for (const row of rows) if (out.at(-1)?.[1] !== row[1]) out.push(row);
  return out;
}

/** Daily rates in percent per day must stay in a plausible range, or the source is suspect. */
export function checkDailyRates(rows: Row[], name: string): void {
  if (rows.length === 0) throw new Error(`${name}: série vazia`);
  for (const [date, value] of rows) {
    const v = Number(value);
    if (!(v > 0 && v < 0.2)) throw new Error(`${name}: taxa diária fora do esperado em ${date}: ${value}`);
  }
}

// ---------- Tesouro Transparente ----------

const TESOURO_HEADER = 'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha';

export interface TesouroRow {
  name: string;
  maturity: IsoDate;
  base: IsoDate;
  /** Hundredths of a percent, so comparisons are exact; 0 when the side is closed. */
  buyRate: number;
  sellRate: number;
  buyPrice: number;
  sellPrice: number;
  basePrice: number;
}

/** "4021,13" as 402113 centavos; also hundredths of a percent for rates such as "6,89". */
export function hundredths(text: string): number {
  const value = brDecimal(text);
  const negative = value.startsWith('-');
  const [int, frac = ''] = value.replace('-', '').split('.') as [string, string?];
  // Rounds half up past the second decimal.
  const cents = Number(int) * 100 + Number(frac.padEnd(3, '0').slice(0, 2)) + (Number(frac[2] ?? 0) >= 5 ? 1 : 0);
  return negative ? -cents : cents;
}

export function parseTesouroCsv(csv: string): TesouroRow[] {
  const lines = csv.split(/\r?\n/);
  if (lines[0]?.trim() !== TESOURO_HEADER) throw new Error(`Tesouro: cabeçalho mudou: ${lines[0]}`);
  const rows: TesouroRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = line.split(';');
    if (c.length !== 8) throw new Error(`Tesouro: linha com ${c.length} colunas: ${line}`);
    rows.push({
      name: c[0]!.trim(),
      maturity: brToIso(c[1]!),
      base: brToIso(c[2]!),
      buyRate: c[3] ? hundredths(c[3]) : 0,
      sellRate: c[4] ? hundredths(c[4]) : 0,
      buyPrice: c[5] ? hundredths(c[5]) : 0,
      sellPrice: c[6] ? hundredths(c[6]) : 0,
      basePrice: c[7] ? hundredths(c[7]) : 0,
    });
  }
  return rows;
}

const rateText = (h: number) => normalizeDecimal((h / 100).toFixed(2));

/** Bonds of the latest base date, with the app's instrument codes. Unknown names are reported. */
export function latestBonds(rows: TesouroRow[], minBonds = 10): { asOf: IsoDate; bonds: TreasuryBond[]; unknown: string[] } {
  const asOf = rows.reduce((max, r) => (r.base > max ? r.base : max), '');
  const unknown = new Set<string>();
  const bonds: TreasuryBond[] = [];
  for (const r of rows) {
    if (r.base !== asOf) continue;
    const type = (TREASURY_TYPES as Record<string, TreasuryType>)[r.name];
    if (!type) {
      unknown.add(r.name);
      continue;
    }
    if (r.basePrice <= 0) continue;
    bonds.push({
      type,
      name: `${r.name} ${r.maturity.slice(0, 4)}`,
      maturity: r.maturity,
      buyRate: r.buyPrice > 0 ? rateText(r.buyRate) : null,
      sellRate: r.sellPrice > 0 ? rateText(r.sellRate) : null,
      buyPrice: r.buyPrice > 0 ? r.buyPrice : null,
      sellPrice: r.sellPrice > 0 ? r.sellPrice : null,
      basePrice: r.basePrice,
    });
  }
  bonds.sort((a, b) => a.type.localeCompare(b.type) || a.maturity.localeCompare(b.maturity));
  if (bonds.length < minBonds) throw new Error(`Tesouro: só ${bonds.length} títulos em ${asOf}`);
  return { asOf, bonds, unknown: [...unknown].sort() };
}

const YEAR_MS = 365.25 * 86_400_000;

/**
 * SPEC, "Termômetro de taxas": for each day, the bond of `name` whose maturity is closest to
 * `targetYears`, and where today's rate sits among the last `lookbackYears` of that series.
 */
export function thermometerSeries(
  rows: TesouroRow[],
  name: string,
  targetYears: number,
  lookbackYears: number,
): ThermometerSeries {
  const best = new Map<IsoDate, { gap: number; rate: number; maturity: IsoDate }>();
  for (const r of rows) {
    const rate = r.buyRate > 0 ? r.buyRate : r.sellRate;
    if (r.name !== name || rate <= 0) continue;
    const gap = Math.abs((Date.parse(r.maturity) - Date.parse(r.base)) / YEAR_MS - targetYears);
    const current = best.get(r.base);
    if (!current || gap < current.gap) best.set(r.base, { gap, rate, maturity: r.maturity });
  }
  const series = [...best.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const last = series.at(-1);
  if (!last) throw new Error(`Termômetro: sem dados de ${name}`);
  const [today, { rate, maturity }] = last;
  const since = addDays(today, -Math.round(lookbackYears * 365.25));
  const window = series.filter(([date]) => date >= since);
  const below = window.filter(([, v]) => v.rate < rate).length;
  const equal = window.filter(([, v]) => v.rate === rate).length;
  const monthly = new Map<string, number>();
  for (const [date, v] of window) monthly.set(date.slice(0, 7), v.rate);
  const rates = window.map(([, v]) => v.rate);
  return {
    bond: `${name} ${maturity.slice(0, 4)}`,
    maturity,
    targetYears,
    rate: rateText(rate),
    percentile: Math.round(((below + equal / 2) / window.length) * 1000) / 10,
    observations: window.length,
    since: window[0]![0],
    min: rateText(Math.min(...rates)),
    max: rateText(Math.max(...rates)),
    monthly: [...monthly.entries()].map(([month, h]) => [month, rateText(h)]),
  };
}

// ---------- B3, COTAHIST ----------

/** BDI codes kept from the spot market: stocks, FIIs, ETFs and BDRs (docs/sources.md). */
const KINDS: Record<string, B3Kind> = { '02': 'acao', '12': 'fii', '14': 'etf', '34': 'bdr', '35': 'bdr', '36': 'bdr' };

/** Fixed-width COTAHIST file (245 columns, latin1), as documented by B3. Odd lines are skipped. */
export function parseCotahist(text: string, minItems = 500): { asOf: IsoDate; items: B3Item[]; skipped: number } {
  const lines = text.split(/\r?\n/);
  const header = lines[0] ?? '';
  if (!header.startsWith('00COTAHIST')) throw new Error('COTAHIST: cabeçalho inesperado');
  const asOf = `${header.slice(23, 27)}-${header.slice(27, 29)}-${header.slice(29, 31)}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`COTAHIST: data inválida no cabeçalho: ${asOf}`);
  const items = new Map<string, B3Item>();
  let skipped = 0;
  for (const line of lines) {
    if (!line.startsWith('01') || line.slice(24, 27) !== '010') continue;
    if (line.length < 245) throw new Error(`COTAHIST: linha curta (${line.length})`);
    const kind = KINDS[line.slice(10, 12)];
    if (!kind) continue;
    const date = `${line.slice(2, 6)}-${line.slice(6, 8)}-${line.slice(8, 10)}`;
    if (date !== asOf) throw new Error(`COTAHIST: linha de ${date} num arquivo de ${asOf}`);
    const ticker = line.slice(12, 24).trim();
    const close = Number(line.slice(108, 121));
    const factor = Number(line.slice(210, 217));
    if (!/^[A-Z0-9]{3,12}$/.test(ticker) || !Number.isSafeInteger(close) || close <= 0 || !Number.isSafeInteger(factor) || factor < 1) {
      skipped++;
      continue;
    }
    items.set(ticker, {
      ticker,
      kind,
      name: line.slice(27, 39).trim(),
      spec: line.slice(39, 49).trim().replace(/\s+/g, ' '),
      close,
      ...(factor !== 1 ? { factor } : {}),
    });
  }
  if (items.size < minItems) throw new Error(`COTAHIST: só ${items.size} papéis`);
  return { asOf, items: [...items.values()].sort((a, b) => a.ticker.localeCompare(b.ticker)), skipped };
}

// ---------- ANBIMA ----------

/** Excel serial day (1900 date system) as an ISO date, free of time zones. */
export function excelSerialToIso(serial: number): IsoDate {
  return addDays('1899-12-30', Math.floor(serial));
}

/** Rows of the ANBIMA sheet (Data | Dia da Semana | Feriado), read with raw serial dates. */
export function parseHolidays(rows: unknown[][], minDates = 500): IsoDate[] {
  const dates = rows
    .map(r => r[0])
    .filter((v): v is number => typeof v === 'number' && v > 30_000 && v < 80_000)
    .map(excelSerialToIso);
  const unique = [...new Set(dates)].sort();
  if (unique.length < minDates) throw new Error(`ANBIMA: só ${unique.length} feriados`);
  return unique;
}

// ---------- Crypto ----------

/** Mercado Bitcoin /symbols answer: crypto assets traded against the real. */
export function mercadoBitcoinSymbols(json: unknown): string[] {
  const j = json as Record<string, unknown[]>;
  const symbols = j['symbol'];
  if (!Array.isArray(symbols)) throw new Error('Mercado Bitcoin: lista de símbolos inesperada');
  return symbols.filter(
    (s, i) => typeof s === 'string' && j['type']?.[i] === 'CRYPTO' && j['currency']?.[i] === 'BRL' && j['exchange-traded']?.[i] === true,
  ) as string[];
}

/** Mercado Bitcoin /tickers answer as asset → last price in reais. */
export function mercadoBitcoinPrices(json: unknown): Record<string, string> {
  if (!Array.isArray(json)) throw new Error('Mercado Bitcoin: resposta não é uma lista');
  const prices: Record<string, string> = {};
  for (const t of json as { pair?: unknown; last?: unknown }[]) {
    if (typeof t?.pair !== 'string' || typeof t.last !== 'string' || !t.pair.endsWith('-BRL')) continue;
    const price = normalizeDecimal(t.last);
    if (Number(price) > 0) prices[t.pair.slice(0, -4)] = price;
  }
  if (!prices['BTC'] || !prices['ETH']) throw new Error('Mercado Bitcoin: sem BTC ou ETH');
  return Object.fromEntries(Object.entries(prices).sort((a, b) => a[0].localeCompare(b[0])));
}
