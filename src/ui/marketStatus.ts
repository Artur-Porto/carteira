// How fresh the stored market data is (SPEC, "Dados de mercado": the app shows the date of each
// data and alerts after 5 business days without an update).
import type { Market } from '../domain/market';
import type { IsoDate } from '../domain/types';
import type { MarketSource, MetaFile } from '../market/files';
import type { marketFiles } from '../market/load';

export const STALE_AFTER_BUSINESS_DAYS = 5;

export const SOURCE_LABELS: Record<MarketSource, string> = {
  indices: 'CDI, Selic e IPCA (Banco Central)',
  treasury: 'Tesouro Direto',
  b3: 'Ações, FIIs, ETFs e BDRs (B3)',
  holidays: 'Feriados (ANBIMA)',
  crypto: 'Cripto (Mercado Bitcoin)',
};

export interface SourceFreshness {
  source: MarketSource;
  asOf: IsoDate | null;
  /** Business days from the data's date to today. */
  age: number | null;
  stale: boolean;
  /** The routine could not refresh it on its last run. */
  late: boolean;
}

type Files = ReturnType<typeof marketFiles>;

const asOfOf = (files: Files, source: MarketSource): IsoDate | null => files[source]?.asOf ?? null;

export function freshness(files: Files, market: Market, today: IsoDate): SourceFreshness[] {
  const meta: MetaFile | undefined = files.meta;
  return (['indices', 'treasury', 'b3', 'crypto', 'holidays'] as const).map(source => {
    const asOf = asOfOf(files, source);
    // The holiday list runs to 2099; only a failure of the routine makes it worth a warning.
    const age = asOf && source !== 'holidays' ? market.calendar.businessDaysBetween(asOf, today) : null;
    return {
      source,
      asOf,
      age,
      stale: asOf === null || (age !== null && age > STALE_AFTER_BUSINESS_DAYS),
      late: meta?.sources[source]?.ok === false,
    };
  });
}

/** The sources that drive the portfolio's values, for the warning on Início. */
export const KEY_SOURCES: readonly MarketSource[] = ['indices', 'treasury', 'b3'];
