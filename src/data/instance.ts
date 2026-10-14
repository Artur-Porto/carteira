import { openDb } from './db';

/** The app's database. Tests open their own with openDb(). */
export const db = openDb();
