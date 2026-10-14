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
  if (!envelope.success) throw new BackupError('invalid');
  if (envelope.data.schemaVersion > SCHEMA_VERSION) throw new BackupError('newer-schema');
  // Backups from older schema versions are migrated here once a second version exists.
  const payload = payloadSchema.safeParse(json);
  if (!payload.success) throw new BackupError('invalid');
  return payload.data;
}

/** Replaces everything on the device with the backup's contents. */
export async function restoreBackup(db: CarteiraDb, payload: BackupPayload): Promise<void> {
  await writeTables(db, payload.tables);
}
