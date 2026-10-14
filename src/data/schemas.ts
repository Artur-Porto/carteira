// Validation of data that enters the database from outside, such as a restored backup
// (SPEC: "Zod valida dados importados"). Each schema is checked against its domain type.
import { z } from 'zod';
import {
  ASSET_CLASSES,
  BUCKETS,
  DECISION_TYPES,
  INDEXERS,
  INSTRUMENT_TYPES,
  LIQUIDITIES,
  SCENARIO_CLASSES,
  TAX_REGIMES,
  TRANSACTION_TYPES,
  type AppSettings,
  type ContributionPlan,
  type DecisionLog,
  type Institution,
  type Lot,
  type PensionPlan,
  type Policy,
  type Position,
  type Thesis,
  type Transaction,
} from '../domain/types';
import type { Tables } from './db';

// The CSP forbids eval. Without this, Zod probes `new Function` once, and the browser reports
// the blocked attempt as a policy violation.
z.config({ jitless: true });

const id = z.string().min(1).max(100);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime();
const cents = z.int();
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);
const text = (max: number) => z.string().max(max);
const assetClass = z.enum(ASSET_CLASSES);
const timestamps = { createdAt: isoDateTime, updatedAt: isoDateTime };

export const settingsSchema: z.ZodType<AppSettings> = z.strictObject({
  id: z.literal('settings'),
  discreetMode: z.boolean(),
  lockEnabled: z.boolean(),
  lastBackupAt: isoDateTime.nullable(),
  demoData: z.boolean(),
  onboardedAt: isoDateTime.nullable(),
  ...timestamps,
});

const band = z.strictObject({ min: z.number(), max: z.number() });

export const policySchema: z.ZodType<Policy> = z.strictObject({
  id: z.literal('policy'),
  reserve: z.strictObject({ months: z.number().min(0), monthlyCostCents: cents, minCdiPct: z.number() }),
  targets: z.record(assetClass, z.number()),
  bands: z.record(assetClass, band),
  limits: z.strictObject({
    criptoMaxPct: z.number(),
    issuerFgcPct: z.number(),
    singleStockMaxPct: z.number(),
    singleFiiMaxPctOfClass: z.number(),
  }),
  scenarios: z.array(
    z.strictObject({ id, name: text(100), shocks: z.record(z.enum(SCENARIO_CLASSES), z.number()) }),
  ),
  tiltEnabled: z.boolean(),
  maxDrawdown: z.number(),
  ...timestamps,
});

export const institutionSchema: z.ZodType<Institution> = z.strictObject({
  id,
  name: text(200),
  conglomerate: text(200),
  fgcCovered: z.boolean(),
  ...timestamps,
});

export const positionSchema: z.ZodType<Position> = z.strictObject({
  id,
  bucket: z.enum(BUCKETS),
  assetClass,
  instrumentType: z.enum(INSTRUMENT_TYPES),
  name: text(200),
  institutionId: id.nullable(),
  indexer: z.enum(INDEXERS).nullable(),
  rate: decimal.nullable(),
  startDate: isoDate.nullable(),
  maturityDate: isoDate.nullable(),
  liquidity: z.enum(LIQUIDITIES),
  ticker: text(20).nullable(),
  quantity: decimal.nullable(),
  costBasisCents: cents,
  ...timestamps,
});

export const lotSchema: z.ZodType<Lot> = z.strictObject({
  id,
  positionId: id,
  date: isoDate,
  amountCents: cents,
  quantity: decimal.nullable(),
  ...timestamps,
});

export const transactionSchema: z.ZodType<Transaction> = z.strictObject({
  id,
  date: isoDate,
  type: z.enum(TRANSACTION_TYPES),
  positionId: id.nullable(),
  amountCents: cents,
  quantity: decimal.nullable(),
  feesCents: cents,
  note: text(2000),
  ...timestamps,
});

export const pensionPlanSchema: z.ZodType<PensionPlan> = z.strictObject({
  id,
  name: text(200),
  startDate: isoDate,
  ownMonthlyCents: cents,
  matchPct: z.number(),
  vestingTable: z.array(z.strictObject({ years: z.number().min(0), pct: z.number().min(0).max(100) })),
  balances: z.array(z.strictObject({ date: isoDate, ownCents: cents, companyCents: cents })),
  composition: z.partialRecord(z.enum(SCENARIO_CLASSES), z.number()),
  fees: z.strictObject({ adminPct: z.number(), loadingPct: z.number() }),
  taxRegime: z.enum(TAX_REGIMES),
  ...timestamps,
});

export const contributionPlanSchema: z.ZodType<ContributionPlan> = z.strictObject({
  id,
  date: isoDate,
  amountCents: cents,
  splits: z.array(z.strictObject({ target: z.union([assetClass, z.literal('reserva')]), amountCents: cents })),
  status: z.enum(['planned', 'done']),
  ...timestamps,
});

export const decisionLogSchema: z.ZodType<DecisionLog> = z.strictObject({
  id,
  date: isoDate,
  type: z.enum(DECISION_TYPES),
  reason: text(2000),
  wouldChangeIf: text(2000),
  relatedIds: z.array(id),
  ...timestamps,
});

export const thesisSchema: z.ZodType<Thesis> = z.strictObject({
  id,
  positionId: id,
  text: text(5000),
  reviewDate: isoDate.nullable(),
  ...timestamps,
});

export const tablesSchema: z.ZodType<Tables> = z.strictObject({
  settings: z.array(settingsSchema).max(1),
  policies: z.array(policySchema).max(1),
  institutions: z.array(institutionSchema),
  positions: z.array(positionSchema),
  lots: z.array(lotSchema),
  transactions: z.array(transactionSchema),
  pensionPlans: z.array(pensionPlanSchema),
  contributionPlans: z.array(contributionPlanSchema),
  decisionLogs: z.array(decisionLogSchema),
  theses: z.array(thesisSchema),
});
