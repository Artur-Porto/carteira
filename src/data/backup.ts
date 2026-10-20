// Backup and restore of every table (SPEC, privacy rule 6 and the "Ajustes" screen).
import { z } from 'zod';
import { saoPauloDay } from '../domain/dates';
import type { IsoDateTime } from '../domain/types';
import { BackupError, decryptBackup, encryptBackup } from './crypto';
import { SCHEMA_VERSION, readTables, writeTables, type CarteiraDb, type Tables } from './db';
import { tablesSchema } from './schemas';

const BACKUP_TYPE = 'carteira-backup';

export interface BackupPayload {
  type: typeof BACKUP_TYPE;
  schemaVersion: number;
  exportedAt: IsoDateTime;
  appVersion: string;
  tables: Tables;
}

const payloadSchema: z.ZodType<BackupPayload> = z.strictObject({
  type: z.literal(BACKUP_TYPE),
  schemaVersion: z.int().min(1),
  exportedAt: z.iso.datetime(),
  appVersion: z.string().max(40),
  tables: tablesSchema,
});
const envelopeSchema = z.object({ type: z.literal(BACKUP_TYPE), schemaVersion: z.int() });

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Schema version 1 (milestone 1) stored lots and each position's quantity and cost, which
 * version 2 derives from the transactions. The transactions already hold that information.
 */
function migrateTablesV1(tables: unknown): unknown {
  if (!isObject(tables)) return tables;
  const { lots: _lots, ...rest } = tables;
  const positions = Array.isArray(rest['positions'])
    ? rest['positions'].map(p => {
        if (!isObject(p)) return p;
        const { quantity: _quantity, costBasisCents: _cost, ...position } = p;
        return position;
      })
    : rest['positions'];
  return { ...rest, positions, reconciliations: [] };
}

/** Brings the tables of an older backup to the current schema, one version at a time. */
function migrate(json: Json, from: number): Json {
  let tables = json['tables'];
  if (from < 2) tables = migrateTablesV1(tables);
  return { ...json, tables };
}

/**
 * Encrypts every table as the device will be once this backup is saved: the settings row
 * already records it, so restoring the file gives back exactly that state.
 */
export async function createBackup(db: CarteiraDb, password: string, appVersion: string, now = new Date()) {
  const exportedAt = now.toISOString();
  const tables = await readTables(db);
  tables.settings = tables.settings.map(s => ({ ...s, lastBackupAt: exportedAt, updatedAt: exportedAt }));
  const payload: BackupPayload = { type: BACKUP_TYPE, schemaVersion: SCHEMA_VERSION, exportedAt, appVersion, tables };
  const bytes = await encryptBackup(new TextEncoder().encode(JSON.stringify(payload)), password);
  return { bytes, exportedAt, fileName: `carteira-${saoPauloDay(now)}.carteira` };
}

/** Records that the backup made at `exportedAt` was saved by the user. */
export async function markBackupSaved(db: CarteiraDb, exportedAt: IsoDateTime): Promise<void> {
  await db.settings.update('settings', { lastBackupAt: exportedAt, updatedAt: exportedAt });
}

/** Decrypts and validates a backup file; failures throw a BackupError with the reason. */
export async function openBackup(file: Uint8Array<ArrayBuffer>, password: string): Promise<BackupPayload> {
  const plaintext = await decryptBackup(file, password);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } catch {
    throw new BackupError('invalid');
  }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success || !isObject(json)) throw new BackupError('invalid');
  if (envelope.data.schemaVersion > SCHEMA_VERSION) throw new BackupError('newer-schema');
  const payload = payloadSchema.safeParse(migrate(json, envelope.data.schemaVersion));
  if (!payload.success) throw new BackupError('invalid');
  return payload.data;
}

/** Replaces everything on the device with the backup's contents. */
export async function restoreBackup(db: CarteiraDb, payload: BackupPayload): Promise<void> {
  await writeTables(db, payload.tables);
}
