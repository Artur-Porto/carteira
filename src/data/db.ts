import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  ContributionPlan,
  DecisionLog,
  Institution,
  Lot,
  PensionPlan,
  Policy,
  Position,
  Thesis,
  Transaction,
} from '../domain/types';

/** Every table holding the owner's data, in backup order. */
export interface Tables {
  settings: AppSettings[];
  policies: Policy[];
  institutions: Institution[];
  positions: Position[];
  lots: Lot[];
  transactions: Transaction[];
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
  'lots',
  'transactions',
  'pensionPlans',
  'contributionPlans',
  'decisionLogs',
  'theses',
] as const satisfies readonly TableName[];

export type CarteiraDb = Dexie & {
  [K in TableName]: EntityTable<Tables[K][number], 'id'>;
};

/** Version of the stored data; backups carry it so a restore can migrate older ones. */
export const SCHEMA_VERSION = 1;

export function openDb(name = 'carteira'): CarteiraDb {
  const db = new Dexie(name) as CarteiraDb;
  // Version 1, milestone 1. Later versions are added below with an upgrade step; this one
  // never changes.
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
