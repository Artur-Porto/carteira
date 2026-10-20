// Format of the public market-data files in /data/*.json, version 1 (SPEC, "Dados de mercado").
// The data routine in pipeline/ writes them and the app reads them; both import these types.
// Every file covers the whole market, never only what the owner holds (privacy rule 5).

/** Calendar date as YYYY-MM-DD. */
type IsoDate = string;
/** Month as YYYY-MM. */
type IsoMonth = string;
/** Instant as an ISO 8601 UTC timestamp. */
type IsoDateTime = string;
/** Decimal number as text with a dot, such as "0.050788"; never a float. */
type DecimalText = string;

export const MARKET_FILES = ['meta', 'indices', 'treasury', 'thermometer', 'b3', 'holidays', 'crypto'] as const;
export type MarketFileName = (typeof MARKET_FILES)[number];

/** Sources the routine downloads; thermometer.json comes from the treasury source. */
export const MARKET_SOURCES = ['indices', 'treasury', 'b3', 'holidays', 'crypto'] as const;
export type MarketSource = (typeof MARKET_SOURCES)[number];

export interface SourceStatus {
  /** False when this run failed and the file kept the previous data. */
  ok: boolean;
  /** Date of the data in the published file. */
  asOf: IsoDate | null;
  /** When the routine last refreshed the file. */
  updatedAt: IsoDateTime | null;
  error?: string;
}

export interface MetaFile {
  version: 1;
  generatedAt: IsoDateTime;
  sources: Record<MarketSource, SourceStatus>;
}

/** Central Bank series (SGS), oldest first. */
export interface IndicesFile {
  version: 1;
  /** Last day with a CDI rate. */
  asOf: IsoDate;
  /** CDI, SGS 12, percent per business day with 6 decimals. */
  cdi: [IsoDate, DecimalText][];
  /** Selic, SGS 11, percent per business day. */
  selic: [IsoDate, DecimalText][];
  /** Selic target, SGS 432, percent per year, one row per change. */
  selicTarget: [IsoDate, DecimalText][];
  /** IPCA, SGS 433, percent in the month. */
  ipca: [IsoMonth, DecimalText][];
  /** Dollar PTAX selling rate, SGS 1, reais per dollar. */
  ptax: [IsoDate, DecimalText][];
}

/** Instrument codes of Tesouro Direto bonds, the same as Position.instrumentType. */
export const TREASURY_TYPES = {
  'Tesouro Selic': 'TesouroSelic',
  'Tesouro Prefixado': 'TesouroPrefixado',
  'Tesouro Prefixado com Juros Semestrais': 'TesouroPrefixadoJuros',
  'Tesouro IPCA+': 'TesouroIPCA',
  'Tesouro IPCA+ com Juros Semestrais': 'TesouroIPCAJuros',
  'Tesouro Educa+': 'TesouroEducaMais',
  'Tesouro Renda+ Aposentadoria Extra': 'TesouroRendaMais',
  'Tesouro IGPM+ com Juros Semestrais': 'TesouroIGPMJuros',
} as const;
export type TreasuryType = (typeof TREASURY_TYPES)[keyof typeof TREASURY_TYPES];

export interface TreasuryBond {
  type: TreasuryType;
  /** Such as "Tesouro IPCA+ 2035". */
  name: string;
  maturity: IsoDate;
  /** Rates in percent per year; null when the bond is not offered on that side. */
  buyRate: DecimalText | null;
  sellRate: DecimalText | null;
  /** Unit prices in centavos. The base price is the one used to value a holding. */
  buyPrice: number | null;
  sellPrice: number | null;
  basePrice: number;
}

/** Tesouro Direto prices and rates of the latest day in the Tesouro Transparente file. */
export interface TreasuryFile {
  version: 1;
  asOf: IsoDate;
  bonds: TreasuryBond[];
}

export interface ThermometerSeries {
  /** Bond whose maturity is closest to the target term today. */
  bond: string;
  maturity: IsoDate;
  targetYears: number;
  /** Today's buying rate, percent per year. */
  rate: DecimalText;
  /** Where today's rate sits in the lookback window, 0 to 100, one decimal. */
  percentile: number;
  observations: number;
  since: IsoDate;
  min: DecimalText;
  max: DecimalText;
  /** Last rate of each month in the window. */
  monthly: [IsoMonth, DecimalText][];
}

/** SPEC, "Termômetro de taxas": each series shifts the target of the class it is named after. */
export interface ThermometerFile {
  version: 1;
  asOf: IsoDate;
  lookbackYears: number;
  series: {
    rfIpcaLonga: ThermometerSeries;
    rfPrefixada: ThermometerSeries;
  };
}

export const B3_KINDS = ['acao', 'fii', 'etf', 'bdr'] as const;
export type B3Kind = (typeof B3_KINDS)[number];

export interface B3Item {
  ticker: string;
  kind: B3Kind;
  /** Short name in the B3 file, such as "PETROBRAS". */
  name: string;
  /** Share type, such as "PN N2", "CI" or "DRN". */
  spec: string;
  /** Closing price in centavos for `factor` units. */
  close: number;
  /** Quotation factor when it is not 1, e.g. 1000 for funds quoted per thousand units. */
  factor?: number;
}

/** Closing prices of the spot market for stocks, FIIs, ETFs and BDRs (B3 COTAHIST). */
export interface B3File {
  version: 1;
  asOf: IsoDate;
  items: B3Item[];
}

/** National holidays from ANBIMA, the calendar for business-day interest. */
export interface HolidaysFile {
  version: 1;
  asOf: IsoDate;
  dates: IsoDate[];
}

/** Last price in reais of every crypto asset quoted against the real. */
export interface CryptoFile {
  version: 1;
  asOf: IsoDate;
  source: 'mercadobitcoin' | 'coinbase';
  prices: Record<string, DecimalText>;
}
