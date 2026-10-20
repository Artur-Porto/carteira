import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { createBackup, markBackupSaved, openBackup, restoreBackup } from '../../src/data/backup';
import { BackupError, encryptBackup } from '../../src/data/crypto';
import { SCHEMA_VERSION, openDb, readTables, type Tables } from '../../src/data/db';
import { ensureSettings, eraseAll } from '../../src/data/settings';
import { demoTables, loadDemo } from '../../src/demo/demo';

let count = 0;
async function freshDb() {
  const db = openDb(`teste-${++count}`);
  await ensureSettings(db);
  return db;
}

async function reasonOf(p: Promise<unknown>) {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof BackupError ? e.reason : String(e);
  }
}

/** Rows ordered by id, as IndexedDB returns them. */
const byId = (tables: Tables): Tables =>
  Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, [...rows].sort((a, b) => a.id.localeCompare(b.id))])) as unknown as Tables;

const encrypt = (payload: unknown) =>
  encryptBackup(new TextEncoder().encode(JSON.stringify(payload)), 'senha do teste');

/**
 * The same tables as milestone 1 stored them (schema 1): lots beside the transactions, and each
 * position's quantity and cost, with no reconciliations.
 */
function asSchema1(tables: Tables) {
  const { reconciliations: _reconciliations, ...rest } = tables;
  const opening = tables.transactions.filter(t => t.type === 'buy' || t.type === 'deposit');
  return {
    ...rest,
    positions: tables.positions.map(p => {
      const own = opening.filter(t => t.positionId === p.id);
      return { ...p, quantity: own[0]?.quantity ?? null, costBasisCents: own.reduce((sum, t) => sum + t.amountCents, 0) };
    }),
    lots: opening.map(t => ({
      id: `lot-${t.id}`,
      positionId: t.positionId,
      date: t.date,
      amountCents: t.amountCents,
      quantity: t.quantity,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  };
}

describe('backup', () => {
  it('restores exactly the state saved with it', async () => {
    const db = await freshDb();
    await loadDemo(db);
    const { bytes, exportedAt, fileName } = await createBackup(db, 'senha do teste', '0.0.0');
    await markBackupSaved(db, exportedAt);
    const saved = await readTables(db);
    expect(saved.positions.length).toBeGreaterThan(0);
    expect(saved.reconciliations.length).toBeGreaterThan(0);
    expect(fileName).toMatch(/^carteira-\d{4}-\d{2}-\d{2}\.carteira$/);

    await eraseAll(db);
    expect((await readTables(db)).positions).toHaveLength(0);

    await restoreBackup(db, await openBackup(bytes, 'senha do teste'));
    expect(await readTables(db)).toEqual(saved);
  });

  it('refuses a backup from a newer version of the data', async () => {
    const file = await encrypt({
      type: 'carteira-backup',
      schemaVersion: 99,
      exportedAt: new Date().toISOString(),
      appVersion: '9.0.0',
      tables: {},
    });
    expect(await reasonOf(openBackup(file, 'senha do teste'))).toBe('newer-schema');
  });

  it('refuses content that breaks the schemas', async () => {
    const tables = demoTables(new Date());
    const broken = { ...tables, transactions: [{ ...tables.transactions[0], amountCents: 10.5 }] };
    const file = await encrypt({
      type: 'carteira-backup',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: '0.0.0',
      tables: broken,
    });
    expect(await reasonOf(openBackup(file, 'senha do teste'))).toBe('invalid');
  });

  it('restores a backup made by milestone 1, migrating it to the current schema', async () => {
    const tables = { ...demoTables(new Date()), reconciliations: [] };
    const file = await encrypt({
      type: 'carteira-backup',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appVersion: '0.1.0',
      tables: asSchema1(tables),
    });
    const payload = await openBackup(file, 'senha do teste');
    expect(payload.tables).toEqual(tables);

    const db = await freshDb();
    await restoreBackup(db, payload);
    expect(await readTables(db)).toEqual(byId(tables));
  });
});

describe('database upgrade', () => {
  it('turns a milestone 1 database into schema 2 without losing movements', async () => {
    const name = `antigo-${++count}`;
    const tables = { ...demoTables(new Date()), reconciliations: [] };
    const old = asSchema1(tables);

    // The database exactly as milestone 1 created it.
    const v1 = new Dexie(name);
    v1.version(1).stores({
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
    await v1.transaction('rw', v1.tables, async () => {
      for (const [table, rows] of Object.entries(old)) await v1.table(table).bulkAdd(rows as object[]);
    });
    v1.close();

    const db = openDb(name);
    expect(await readTables(db)).toEqual(byId(tables));
    expect(db.tables.map(t => t.name)).not.toContain('lots');
    expect(db.verno).toBe(SCHEMA_VERSION);
    db.close();
  });
});
