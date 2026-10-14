import { initialPolicy } from '../domain/policy';
import type { AppSettings } from '../domain/types';
import { TABLES, type CarteiraDb } from './db';

type SettingsChanges = Partial<Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'>>;

export function defaultSettings(now: string): AppSettings {
  return {
    id: 'settings',
    discreetMode: false,
    lockEnabled: false,
    lastBackupAt: null,
    demoData: false,
    onboardedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Creates the settings row on the first launch, or after everything was erased. */
export async function ensureSettings(db: CarteiraDb): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    if (!(await db.settings.get('settings'))) await db.settings.add(defaultSettings(new Date().toISOString()));
  });
}

export async function updateSettings(db: CarteiraDb, changes: SettingsChanges): Promise<void> {
  await db.settings.update('settings', { ...changes, updatedAt: new Date().toISOString() });
}

/** First launch without demo data: the initial policy, with the monthly cost still to fill in. */
export async function startEmpty(db: CarteiraDb): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.settings, db.policies, async () => {
    await db.policies.put(initialPolicy(now));
    await db.settings.update('settings', { demoData: false, onboardedAt: now, updatedAt: now });
  });
}

/** Deletes every record and goes back to the first-launch screen. */
export async function eraseAll(db: CarteiraDb): Promise<void> {
  await db.transaction('rw', TABLES.map(name => db.table(name)), async () => {
    for (const name of TABLES) await db.table(name).clear();
    await db.settings.add(defaultSettings(new Date().toISOString()));
  });
}
