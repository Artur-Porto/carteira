// Domain types for the whole app (SPEC, "Modelo de dados"). Pure: no UI, network or storage.

/** Money is always an integer number of centavos. */
export type Cents = number;
/** Rates and quantities are decimal strings, never floating point. */
export type Decimal = string;
/** Calendar date as YYYY-MM-DD, in the São Paulo time zone. */
export type IsoDate = string;
/** Instant as an ISO 8601 UTC timestamp. */
export type IsoDateTime = string;

export const ASSET_CLASSES = [
  'rfPosFixada',
  'rfIpcaCurta',
  'rfPrefixada',
  'rfIpcaLonga',
  'acoesBrasil',
  'fiis',
  'exterior',
  'cripto',
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/** Pension funds may also hold private credit, which only matters for the scenarios. */
export const SCENARIO_CLASSES = [...ASSET_CLASSES, 'creditoPrivado'] as const;
export type ScenarioClass = (typeof SCENARIO_CLASSES)[number];

/** Pension savings live in PensionPlan, so positions are either reserve or free portfolio. */
export const BUCKETS = ['reserva', 'livre'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const INSTRUMENT_TYPES = [
  'CDB',
  'RDB',
  'LCI',
  'LCA',
  'TesouroSelic',
  'TesouroReserva',
  'TesouroPrefixado',
  'TesouroPrefixadoJuros',
  'TesouroIPCA',
  'TesouroIPCAJuros',
  'Acao',
  'FII',
  'ETF',
  'BDR',
  'Cripto',
] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

export const INDEXERS = ['CDI', 'SELIC', 'IPCA', 'PRE'] as const;
export type Indexer = (typeof INDEXERS)[number];

/** Daily redemption, only at maturity, or sold on the exchange. */
export const LIQUIDITIES = ['diaria', 'vencimento', 'bolsa'] as const;
export type Liquidity = (typeof LIQUIDITIES)[number];

export const TRANSACTION_TYPES = ['buy', 'sell', 'deposit', 'withdraw', 'income', 'contribution'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TAX_REGIMES = ['indefinido', 'progressivo', 'regressivo'] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];

export const DECISION_TYPES = ['aporte', 'rebalanceamento', 'venda', 'politica', 'revisao', 'outro'] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

export interface Timestamps {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Records use UUIDs; the two singletons below use fixed ids. */
export interface Entity extends Timestamps {
  id: string;
}

export interface AppSettings extends Timestamps {
  id: 'settings';
  discreetMode: boolean;
  lockEnabled: boolean;
  lastBackupAt: IsoDateTime | null;
  /** True while the data on the device is the fictitious demo set. */
  demoData: boolean;
  /** Set when the first-run screen is done; null shows it again. */
  onboardedAt: IsoDateTime | null;
}

export interface Band {
  min: number;
  max: number;
}

/** Shock in percent per class, e.g. -20 for a 20% fall. */
export interface Scenario {
  id: string;
  name: string;
  shocks: Record<ScenarioClass, number>;
}

/** Percentages are plain numbers (22 means 22%); calculations convert them to decimals. */
export interface Policy extends Timestamps {
  id: 'policy';
  reserve: { months: number; monthlyCostCents: Cents; minCdiPct: number };
  targets: Record<AssetClass, number>;
  bands: Record<AssetClass, Band>;
  limits: {
    criptoMaxPct: number;
    issuerFgcPct: number;
    singleStockMaxPct: number;
    singleFiiMaxPctOfClass: number;
  };
  scenarios: Scenario[];
  tiltEnabled: boolean;
  maxDrawdown: number;
}

export interface Institution extends Entity {
  name: string;
  conglomerate: string;
  fgcCovered: boolean;
}

export interface Position extends Entity {
  bucket: Bucket;
  assetClass: AssetClass;
  instrumentType: InstrumentType;
  /** Label shown to the user, such as "CDB Banco X 110% do CDI". */
  name: string;
  institutionId: string | null;
  indexer: Indexer | null;
  /** Percent of CDI, real rate over IPCA, or fixed rate, depending on the indexer. */
  rate: Decimal | null;
  startDate: IsoDate | null;
  maturityDate: IsoDate | null;
  liquidity: Liquidity;
  ticker: string | null;
  quantity: Decimal | null;
  costBasisCents: Cents;
}

/** One purchase or deposit; drives income tax by holding period and the average cost. */
export interface Lot extends Entity {
  positionId: string;
  date: IsoDate;
  amountCents: Cents;
  quantity: Decimal | null;
}

export interface Transaction extends Entity {
  date: IsoDate;
  type: TransactionType;
  positionId: string | null;
  amountCents: Cents;
  quantity: Decimal | null;
  feesCents: Cents;
  note: string;
}

export interface VestingStep {
  /** Full years in the plan. */
  years: number;
  /** Share of the company's part released from that point on. */
  pct: number;
}

export interface PensionBalance {
  date: IsoDate;
  ownCents: Cents;
  companyCents: Cents;
}

export interface PensionPlan extends Entity {
  name: string;
  startDate: IsoDate;
  ownMonthlyCents: Cents;
  /** Company match as a percentage of the participant's contribution. */
  matchPct: number;
  vestingTable: VestingStep[];
  balances: PensionBalance[];
  composition: Partial<Record<ScenarioClass, number>>;
  fees: { adminPct: number; loadingPct: number };
  taxRegime: TaxRegime;
}

export interface ContributionSplit {
  target: AssetClass | 'reserva';
  amountCents: Cents;
}

export interface ContributionPlan extends Entity {
  date: IsoDate;
  amountCents: Cents;
  splits: ContributionSplit[];
  status: 'planned' | 'done';
}

export interface DecisionLog extends Entity {
  date: IsoDate;
  type: DecisionType;
  reason: string;
  wouldChangeIf: string;
  relatedIds: string[];
}

export interface Thesis extends Entity {
  positionId: string;
  text: string;
  reviewDate: IsoDate | null;
}
