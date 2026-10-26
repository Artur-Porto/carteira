// Market data as the calculations use it, built from the public files of src/market/files.ts.
// Any file may be missing, such as on a first launch offline; the valuation then falls back to
// the cost and says why.
import type { B3File, B3Item, CryptoFile, HolidaysFile, IndicesFile, ThermometerFile, TreasuryBond, TreasuryFile } from '../market/files';
import { BusinessCalendar, monthOf } from './calendar';
import { Dec, ONE, dec } from './decimal';
import type { IsoDate } from './types';

/** "0.050788" as 50788n: units of 10^-scale. Rounds half up past `scale` decimals. */
export function scaledInt(text: string, scale: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(text)) throw new RangeError(`número inválido: ${text}`);
  const [int, frac = ''] = text.split('.') as [string, string?];
  const digits = BigInt(int + frac.padEnd(scale, '0').slice(0, scale));
  return Number(frac[scale] ?? '0') >= 5 ? digits + 1n : digits;
}

/** A daily rate series in percent per business day, oldest first. */
export class DailyRates {
  readonly dates: readonly IsoDate[];
  /**
   * Each day's rate as a fraction in units of 10^-8: the 8 decimals of the B3 method.
   * 0.050788% a day is 0.00050788, so 50788n.
   */
  readonly units: readonly bigint[];

  constructor(rows: readonly (readonly [IsoDate, string])[]) {
    this.dates = rows.map(r => r[0]);
    this.units = rows.map(r => scaledInt(r[1], 6));
  }

  get first(): IsoDate | undefined {
    return this.dates[0];
  }

  get last(): IsoDate | undefined {
    return this.dates.at(-1);
  }

  /** Index of the first day on or after `date`. */
  lowerBound(date: IsoDate): number {
    let lo = 0;
    let hi = this.dates.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.dates[mid]! < date) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

/** Monthly IPCA in percent, with the index at the start of each month. */
export class MonthlyRates {
  readonly months: readonly string[];
  readonly rates: readonly Dec[];
  /** Index at the start of each month, 1 at the start of the first one. */
  private readonly starts: readonly Dec[];

  constructor(rows: readonly (readonly [string, string])[]) {
    this.months = rows.map(r => r[0]);
    this.rates = rows.map(r => dec(r[1]));
    const starts: Dec[] = [];
    let index = ONE;
    for (const rate of this.rates) {
      starts.push(index);
      index = index.mul(rate.div(100).plus(1));
    }
    this.starts = starts;
  }

  get last(): string | undefined {
    return this.months.at(-1);
  }

  /**
   * IPCA index on a date, spreading each month's rate over its days. Months not published yet
   * repeat the last published rate, and `estimated` says so. Undefined before the series.
   */
  indexAt(date: IsoDate): { index: Dec; estimated: boolean } | undefined {
    const first = this.months[0];
    const last = this.last;
    if (!first || !last || monthOf(date) < first) return undefined;
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const fraction = new Dec(d - 1).div(new Date(Date.UTC(y, m, 0)).getUTCDate());
    const month = monthOf(date);
    const i = this.months.indexOf(month);
    if (i >= 0) return { index: this.starts[i]!.mul(this.rates[i]!.div(100).plus(1).pow(fraction)), estimated: false };
    if (month <= last) return undefined;
    // After the last published month: compound the last rate for the missing months.
    const lastRate = this.rates.at(-1)!.div(100).plus(1);
    const afterLast = this.starts.at(-1)!.mul(lastRate);
    const [ly, lm] = last.split('-').map(Number) as [number, number];
    const missingMonths = (y - ly) * 12 + (m - lm) - 1;
    return { index: afterLast.mul(lastRate.pow(missingMonths)).mul(lastRate.pow(fraction)), estimated: true };
  }
}

export interface Market {
  calendar: BusinessCalendar;
  /** False until the holiday list arrives; business days then skip weekends only. */
  hasHolidays: boolean;
  cdi: DailyRates;
  selic: DailyRates;
  ipca: MonthlyRates;
  bonds: ReadonlyMap<string, TreasuryBond>;
  bondsAsOf: IsoDate | null;
  b3: ReadonlyMap<string, B3Item>;
  b3AsOf: IsoDate | null;
  crypto: ReadonlyMap<string, string>;
  cryptoAsOf: IsoDate | null;
}

export interface MarketFiles {
  indices?: IndicesFile;
  treasury?: TreasuryFile;
  b3?: B3File;
  holidays?: HolidaysFile;
  crypto?: CryptoFile;
  /** Read by the engine's thermometer, not by the valuation. */
  thermometer?: ThermometerFile;
}

export const bondKey = (type: string, maturity: IsoDate) => `${type}|${maturity}`;

export function buildMarket(files: MarketFiles): Market {
  return {
    calendar: new BusinessCalendar(files.holidays?.dates ?? []),
    hasHolidays: Boolean(files.holidays?.dates.length),
    cdi: new DailyRates(files.indices?.cdi ?? []),
    selic: new DailyRates(files.indices?.selic ?? []),
    ipca: new MonthlyRates(files.indices?.ipca ?? []),
    bonds: new Map((files.treasury?.bonds ?? []).map(b => [bondKey(b.type, b.maturity), b])),
    bondsAsOf: files.treasury?.asOf ?? null,
    b3: new Map((files.b3?.items ?? []).map(i => [i.ticker, i])),
    b3AsOf: files.b3?.asOf ?? null,
    crypto: new Map(Object.entries(files.crypto?.prices ?? {})),
    cryptoAsOf: files.crypto?.asOf ?? null,
  };
}

export const EMPTY_MARKET: Market = buildMarket({});
