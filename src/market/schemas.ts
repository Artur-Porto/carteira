// Validation of the market files the app downloads (SPEC: "Zod valida ... arquivos de mercado").
// Objects accept unknown keys, so a later routine can add fields without breaking older apps; a
// breaking change bumps `version`, which these schemas refuse.
import { z } from 'zod';
import {
  B3_KINDS,
  MARKET_SOURCES,
  TREASURY_TYPES,
  type B3File,
  type CryptoFile,
  type HolidaysFile,
  type IndicesFile,
  type MarketFileName,
  type MetaFile,
  type ThermometerFile,
  type TreasuryFile,
} from './files';

// The CSP forbids eval; see src/data/schemas.ts.
z.config({ jitless: true });

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime();
const month = z.string().regex(/^\d{4}-\d{2}$/);
const decimalText = z.string().regex(/^-?\d+(\.\d+)?$/);
const dailyRows = z.array(z.tuple([isoDate, decimalText]));
const version = z.literal(1);

export const metaSchema: z.ZodType<MetaFile> = z.object({
  version,
  generatedAt: isoDateTime,
  sources: z.record(
    z.enum(MARKET_SOURCES),
    z.object({ ok: z.boolean(), asOf: isoDate.nullable(), updatedAt: isoDateTime.nullable(), error: z.string().optional() }),
  ),
});

export const indicesSchema: z.ZodType<IndicesFile> = z.object({
  version,
  asOf: isoDate,
  cdi: dailyRows,
  selic: dailyRows,
  selicTarget: dailyRows,
  ipca: z.array(z.tuple([month, decimalText])),
  ptax: dailyRows,
});

const cents = z.int().positive();

export const treasurySchema: z.ZodType<TreasuryFile> = z.object({
  version,
  asOf: isoDate,
  bonds: z.array(
    z.object({
      type: z.enum(Object.values(TREASURY_TYPES)),
      name: z.string().max(100),
      maturity: isoDate,
      buyRate: decimalText.nullable(),
      sellRate: decimalText.nullable(),
      buyPrice: cents.nullable(),
      sellPrice: cents.nullable(),
      basePrice: cents,
    }),
  ),
});

const thermometerSeries = z.object({
  bond: z.string().max(100),
  maturity: isoDate,
  targetYears: z.number().positive(),
  rate: decimalText,
  percentile: z.number().min(0).max(100),
  observations: z.int().nonnegative(),
  since: isoDate,
  min: decimalText,
  max: decimalText,
  monthly: z.array(z.tuple([month, decimalText])),
});

export const thermometerSchema: z.ZodType<ThermometerFile> = z.object({
  version,
  asOf: isoDate,
  lookbackYears: z.number().positive(),
  series: z.object({ rfIpcaLonga: thermometerSeries, rfPrefixada: thermometerSeries }),
});

export const b3Schema: z.ZodType<B3File> = z.object({
  version,
  asOf: isoDate,
  items: z.array(
    z.object({
      ticker: z.string().min(1).max(12),
      kind: z.enum(B3_KINDS),
      name: z.string().max(40),
      spec: z.string().max(20),
      close: cents,
      factor: z.int().positive().optional(),
    }),
  ),
});

export const holidaysSchema: z.ZodType<HolidaysFile> = z.object({ version, asOf: isoDate, dates: z.array(isoDate) });

export const cryptoSchema: z.ZodType<CryptoFile> = z.object({
  version,
  asOf: isoDate,
  source: z.enum(['mercadobitcoin', 'coinbase']),
  prices: z.record(z.string().max(20), decimalText),
});

/** Schema of each data file; meta.json is read first, to know which files changed. */
export const DATA_SCHEMAS = {
  indices: indicesSchema,
  treasury: treasurySchema,
  thermometer: thermometerSchema,
  b3: b3Schema,
  holidays: holidaysSchema,
  crypto: cryptoSchema,
} satisfies Record<Exclude<MarketFileName, 'meta'>, z.ZodType>;
