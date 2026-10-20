// Interest factors of fixed income held by amount (SPEC, "Rendimento da reserva" and "Juros em
// dias úteis, base 252").
import { addDays, type BusinessCalendar } from './calendar';
import { Dec, ONE, ZERO, dec } from './decimal';
import type { DailyRates, Market, MonthlyRates } from './market';
import type { IsoDate, Position } from './types';

export interface Accrual {
  /** Multiplies an amount applied on `from` into its value on `to`. */
  factor: Dec;
  /** True when part of the period uses rates not published yet, repeated from the last one. */
  estimated: boolean;
}

export interface AccrualSource {
  /** Undefined when the rate history does not reach back to `from`. */
  factor(from: IsoDate, to: IsoDate): Accrual | undefined;
}

const SCALE = 10n ** 16n;
const TO_8_DECIMALS = 10n ** 8n;

interface Cursor {
  /** Every business day before `next`, from the start date on, is already in `acc`. */
  next: IsoDate;
  /** First series row not applied yet. */
  row: number;
  acc: bigint;
  businessDays: number;
  estimatedDays: number;
}

/**
 * B3 method for DI-indexed fixed income ("Caderno de Fórmulas", CDB): each business day k
 * multiplies by (1 + TDI_k × p), where TDI_k is the day's rate with 8 decimals and p the
 * contracted percentage. The running product is truncated at 16 decimals and the factor of a
 * date is rounded to 8. Integers keep it exact; a cursor per start date makes every lot walk its
 * days once, however many times it is valued along the way.
 *
 * Days after the last published rate repeat it, and count as estimated.
 */
export class DailyRateAccrual implements AccrualSource {
  /** Daily increment per unit of the day's rate: p with 4 decimals, times 100 for the 16-decimal scale. */
  private readonly multiplier: bigint;
  private readonly cursors = new Map<IsoDate, Cursor>();

  constructor(
    private readonly series: DailyRates,
    private readonly calendar: BusinessCalendar,
    pct: Dec,
    /** Spread per year over the rate, as in Selic + 0.05%. */
    private readonly spreadPct: Dec = ZERO,
  ) {
    this.multiplier = BigInt(pct.mul(10_000).toFixed(0)) * 100n;
  }

  factor(from: IsoDate, to: IsoDate): Accrual | undefined {
    const { series } = this;
    const first = series.first;
    const last = series.last;
    if (!first || !last || from < first) return undefined;
    if (to <= from) return { factor: ONE, estimated: false };

    let c = this.cursors.get(from);
    if (!c || c.next > to) {
      c = { next: from, row: series.lowerBound(from), acc: SCALE, businessDays: 0, estimatedDays: 0 };
      this.cursors.set(from, c);
    }
    while (c.row < series.dates.length && series.dates[c.row]! < to) {
      c.acc = (c.acc * (SCALE + series.units[c.row]! * this.multiplier)) / SCALE;
      c.row++;
      c.businessDays++;
    }
    const lastDaily = SCALE + series.units.at(-1)! * this.multiplier;
    const afterLast = addDays(last, 1);
    const pending = this.calendar.businessDaysBetween(c.next > afterLast ? c.next : afterLast, to);
    for (let k = 0; k < pending; k++) c.acc = (c.acc * lastDaily) / SCALE;
    c.businessDays += pending;
    c.estimatedDays += pending;
    if (to > c.next) c.next = to;

    let factor = new Dec(((c.acc + TO_8_DECIMALS / 2n) / TO_8_DECIMALS).toString()).div(1e8);
    if (!this.spreadPct.isZero()) factor = factor.mul(this.spreadPct.div(100).plus(1).pow(new Dec(c.businessDays).div(252)));
    return { factor, estimated: c.estimatedDays > 0 };
  }
}

/** Fixed rate per year, compounded over business days: (1 + rate)^(du/252). */
export class FixedRateAccrual implements AccrualSource {
  constructor(
    private readonly calendar: BusinessCalendar,
    private readonly ratePct: Dec,
  ) {}

  factor(from: IsoDate, to: IsoDate): Accrual {
    if (to <= from) return { factor: ONE, estimated: false };
    const du = this.calendar.businessDaysBetween(from, to);
    return { factor: this.ratePct.div(100).plus(1).pow(new Dec(du).div(252)), estimated: false };
  }
}

/**
 * IPCA plus a real rate: the change of the IPCA index between the dates, spread over the days of
 * each month, times the real rate over business days. An estimate: issuers follow their own
 * anniversary and lag rules, which the bank balance corrects through the reconciliation.
 */
export class IpcaAccrual implements AccrualSource {
  constructor(
    private readonly ipca: MonthlyRates,
    private readonly calendar: BusinessCalendar,
    private readonly realRatePct: Dec,
  ) {}

  factor(from: IsoDate, to: IsoDate): Accrual | undefined {
    if (to <= from) return { factor: ONE, estimated: false };
    const start = this.ipca.indexAt(from);
    const end = this.ipca.indexAt(to);
    if (!start || !end) return undefined;
    const real = new FixedRateAccrual(this.calendar, this.realRatePct).factor(from, to).factor;
    return { factor: end.index.div(start.index).mul(real), estimated: end.estimated };
  }
}

/**
 * How a position held by amount earns, from its indexer and rate (see Position.rate). Undefined
 * when the app cannot tell, and the position is then valued at cost.
 */
export function accrualFor(position: Pick<Position, 'indexer' | 'rate'>, market: Market): AccrualSource | undefined {
  const rate = position.rate === null ? null : dec(position.rate);
  switch (position.indexer) {
    case 'CDI':
      return new DailyRateAccrual(market.cdi, market.calendar, rate ?? new Dec(100));
    case 'SELIC':
      return new DailyRateAccrual(market.selic, market.calendar, new Dec(100), rate ?? ZERO);
    case 'PRE':
      return rate === null ? undefined : new FixedRateAccrual(market.calendar, rate);
    case 'IPCA':
      return rate === null ? undefined : new IpcaAccrual(market.ipca, market.calendar, rate);
    case null:
      return undefined;
  }
}
