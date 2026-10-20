import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  ContributionPlan,
  DecisionLog,
  Institution,
  PensionPlan,
  Policy,
  Position,
  Reconciliation,
  Thesis,
  Transaction,
} from '../domain/types';
import type { MarketFileName } from '../market/files';

/** Every table holding the owner's data, in backup order. */
export interface Tables {
  settings: AppSettings[];
  policies: Policy[];
  institutions: Institution[];
  positions: Position[];
  transactions: Transaction[];
  reconciliations: Reconciliation[];
  pensionPlans: PensionPlan[];
  contributionPlans: ContributionPlan[];
  decisionLogs: DecisionLog[];
  theses: Thesis[];
}
export type TableName = keyof Tables;

export const TABLES = [
  'settings',
  'policies',
  'institutions',
  'positions',
  'transactions',
  'reconciliations',
  'pensionPlans',
  'contributionPlans',
  'decisionLogs',
  'theses',
] as const satisfies readonly TableName[];

/**
 * A public market file as last downloaded. It is not the owner's data, so it stays out of the
 * backup and the app downloads it again when needed.
 */
export interface MarketRow {
  name: MarketFileName;
  asOf: string;
  /** When the data routine refreshed the file, from meta.json. */
  updatedAt: string | null;
  fetchedAt: string;
  data: unknown;
}

export type CarteiraDb = Dexie & {
  [K in TableName]: EntityTable<Tables[K][number], 'id'>;
} & { market: EntityTable<MarketRow, 'name'> };

/** Version of the stored data; backups carry it so a restore can migrate older ones. */
export const SCHEMA_VERSION = 2;

export function openDb(name = 'carteira'): CarteiraDb {
  const db = new Dexie(name) as CarteiraDb;
  // Each version stays as it was; a new one lists only what changes, with its upgrade step.
  db.version(1).stores({
    settings: 'id',
    policies: 'id',
    institutions: 'id, name',
    positions: 'id, bucket, assetClass, institutionId, ticker',
    lots: 'id, positionId, date',
    transactions: 'id, positionId, date, type',
    pensionPlans: 'id',
    contributionPlans: 'id, date, status',
    decisionLogs: 'id, date, type',
    theses: 'id, positionId',
  });
  // Version 2, milestone 2: lots and the position's quantity and cost come from the transactions
  // (domain/valuation.ts); bank balances are reconciliations; market files are kept for offline use.
  db.version(2)
    .stores({ lots: null, reconciliations: 'id, positionId, date', market: 'name' })
    .upgrade(tx =>
      tx
        .table('positions')
        .toCollection()
        .modify((p: Record<string, unknown>) => {
          delete p['quantity'];
          delete p['costBasisCents'];
        }),
    );
  return db;
}

/** Reads every table in one transaction, so the snapshot is consistent. */
export async function readTables(db: CarteiraDb): Promise<Tables> {
  return db.transaction('r', TABLES.map(name => db.table(name)), async () => {
    const rows = await Promise.all(TABLES.map(name => db.table(name).toArray()));
    return Object.fromEntries(TABLES.map((name, i) => [name, rows[i]])) as unknown as Tables;
  });
}

/** Replaces every table with the given rows, all or nothing. */
export async function writeTables(db: CarteiraDb, tables: Tables): Promise<void> {
  await db.transaction('rw', TABLES.map(name => db.table(name)), async () => {
    for (const name of TABLES) {
      await db.table(name).clear();
      await db.table(name).bulkAdd(tables[name]);
    }
  });
}

export function emptyTables(): Tables {
  return Object.fromEntries(TABLES.map(name => [name, []])) as unknown as Tables;
}
