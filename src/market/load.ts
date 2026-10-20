// Downloads the public market files from the app's own origin (SPEC, privacy rule 1) and keeps
// them in IndexedDB, so the app works offline with the last data it saw.
import type { CarteiraDb, MarketRow } from '../data/db';
import type { MarketFiles } from '../domain/market';
import type { MarketFileName, MarketSource, MetaFile } from './files';
import { DATA_SCHEMAS, metaSchema } from './schemas';

type DataFile = keyof typeof DATA_SCHEMAS;
const DATA_FILES = Object.keys(DATA_SCHEMAS) as DataFile[];

/** The routine's source behind each file. */
const SOURCE_OF: Record<DataFile, MarketSource> = {
  indices: 'indices',
  treasury: 'treasury',
  thermometer: 'treasury',
  b3: 'b3',
  holidays: 'holidays',
  crypto: 'crypto',
};

export type Fetcher = (url: string) => Promise<Response>;

/** Asks the server every time; it answers "not modified" when the file did not change. */
const fetchFresh: Fetcher = url => fetch(url, { cache: 'no-cache' });

export interface RefreshResult {
  updated: MarketFileName[];
  failed: MarketFileName[];
}

/**
 * Downloads meta.json and then every file whose routine run differs from the stored one. A file
 * that fails, or that is older than the stored one, leaves the stored copy as it was.
 */
export async function refreshMarket(db: CarteiraDb, base = import.meta.env.BASE_URL, get: Fetcher = fetchFresh): Promise<RefreshResult> {
  const metaResponse = await get(`${base}data/meta.json`);
  if (!metaResponse.ok) throw new Error(`meta.json: HTTP ${metaResponse.status}`);
  const meta = metaSchema.parse(await metaResponse.json());
  const stored = new Map((await db.market.toArray()).map(row => [row.name, row]));
  const now = new Date().toISOString();
  const result: RefreshResult = { updated: [], failed: [] };

  for (const name of DATA_FILES) {
    const status = meta.sources[SOURCE_OF[name]];
    const current = stored.get(name);
    if (current && status && current.updatedAt === status.updatedAt) continue;
    try {
      const response = await get(`${base}data/${name}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = DATA_SCHEMAS[name].parse(await response.json());
      if (current && current.asOf > data.asOf) continue;
      await db.market.put({ name, asOf: data.asOf, updatedAt: status?.updatedAt ?? null, fetchedAt: now, data });
      result.updated.push(name);
    } catch {
      result.failed.push(name);
    }
  }
  await db.market.put({ name: 'meta', asOf: meta.generatedAt.slice(0, 10), updatedAt: meta.generatedAt, fetchedAt: now, data: meta });
  return result;
}

/** The stored files, ready for domain/market.ts. They were validated when downloaded. */
export function marketFiles(rows: readonly MarketRow[]): MarketFiles & { meta?: MetaFile } {
  return Object.fromEntries(rows.map(row => [row.name, row.data])) as MarketFiles & { meta?: MetaFile };
}
