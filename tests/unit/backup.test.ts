import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createBackup, markBackupSaved, openBackup, restoreBackup } from '../../src/data/backup';
import { BackupError, encryptBackup } from '../../src/data/crypto';
import { openDb, readTables } from '../../src/data/db';
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

const encrypt = (payload: unknown) =>
  encryptBackup(new TextEncoder().encode(JSON.stringify(payload)), 'senha do teste');

describe('backup', () => {
  it('restores exactly the state saved with it', async () => {
    const db = await freshDb();
    await loadDemo(db);
    const { bytes, exportedAt, fileName } = await createBackup(db, 'senha do teste', '0.0.0');
    await markBackupSaved(db, exportedAt);
    const saved = await readTables(db);
    expect(saved.positions.length).toBeGreaterThan(0);
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
    const broken = { ...tables, positions: [{ ...tables.positions[0], costBasisCents: 10.5 }] };
    const file = await encrypt({
      type: 'carteira-backup',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appVersion: '0.0.0',
      tables: broken,
    });
    expect(await reasonOf(openBackup(file, 'senha do teste'))).toBe('invalid');
  });
});
