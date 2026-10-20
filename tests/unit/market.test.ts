import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/data/db';
import type { MetaFile } from '../../src/market/files';
import { refreshMarket } from '../../src/market/load';

const meta = (updatedAt: string): MetaFile => ({
  version: 1,
  generatedAt: updatedAt,
  sources: {
    indices: { ok: true, asOf: '2026-10-16', updatedAt },
    treasury: { ok: true, asOf: '2026-10-15', updatedAt },
    b3: { ok: true, asOf: '2026-10-19', updatedAt },
    holidays: { ok: true, asOf: '2026-10-19', updatedAt },
    crypto: { ok: false, asOf: '2026-10-19', updatedAt, error: 'HTTP 503' },
  },
});

const series = { bond: 'Tesouro IPCA+ 2035', maturity: '2035-05-15', targetYears: 10, rate: '6.84', percentile: 81.5, observations: 2489, since: '2016-10-14', min: '1.99', max: '8.22', monthly: [] };

function files(b3AsOf: string, generatedAt: string): Record<string, unknown> {
  return {
    meta: meta(generatedAt),
    indices: { version: 1, asOf: '2026-10-16', cdi: [['2026-10-16', '0.050788']], selic: [], selicTarget: [], ipca: [], ptax: [] },
    treasury: { version: 1, asOf: '2026-10-15', bonds: [] },
    thermometer: { version: 1, asOf: '2026-10-15', lookbackYears: 10, series: { rfIpcaLonga: series, rfPrefixada: series } },
    b3: { version: 1, asOf: b3AsOf, items: [{ ticker: 'ABCD3', kind: 'acao', name: 'EMPRESA FICT', spec: 'ON', close: 1300, newField: 1 }] },
    holidays: { version: 1, asOf: '2026-10-19', dates: ['2026-11-02'] },
    crypto: { version: 2, asOf: '2026-10-19', source: 'mercadobitcoin', prices: { BTC: '1' } },
  };
}

function server(content: Record<string, unknown>) {
  const requested: string[] = [];
  const get = async (url: string) => {
    requested.push(url);
    const name = /data\/(\w+)\.json$/.exec(url)?.[1] ?? '';
    return name in content ? new Response(JSON.stringify(content[name])) : new Response('não encontrado', { status: 404 });
  };
  return { get, requested };
}

describe('market files', () => {
  it('stores the valid files, from the app’s own address, and refuses a newer format', async () => {
    const db = openDb('mercado-1');
    const { get, requested } = server(files('2026-10-19', '2026-10-20T01:20:00.000Z'));
    const result = await refreshMarket(db, '/carteira/', get);
    expect(requested.every(url => url.startsWith('/carteira/data/'))).toBe(true);
    expect(result.updated.sort()).toEqual(['b3', 'holidays', 'indices', 'thermometer', 'treasury']);
    // crypto.json declares version 2, which this app does not know.
    expect(result.failed).toEqual(['crypto']);
    expect((await db.market.get('b3'))?.asOf).toBe('2026-10-19');
  });

  it('skips files the routine did not refresh and never goes back to older data', async () => {
    const db = openDb('mercado-2');
    await refreshMarket(db, '/', server(files('2026-10-19', '2026-10-20T01:20:00.000Z')).get);

    const same = server(files('2026-10-19', '2026-10-20T01:20:00.000Z'));
    expect((await refreshMarket(db, '/', same.get)).updated).toEqual([]);
    expect(same.requested.filter(url => !url.endsWith('meta.json') && !url.endsWith('crypto.json'))).toEqual([]);

    const older = server(files('2026-10-16', '2026-10-21T01:20:00.000Z'));
    const result = await refreshMarket(db, '/', older.get);
    expect(result.updated).not.toContain('b3');
    expect((await db.market.get('b3'))?.asOf).toBe('2026-10-19');
  });

  it('fails without meta.json and keeps what it had', async () => {
    const db = openDb('mercado-3');
    await expect(refreshMarket(db, '/', server({}).get)).rejects.toThrow(/meta\.json/);
    expect(await db.market.count()).toBe(0);
  });
});
