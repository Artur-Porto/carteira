// Daily data routine (SPEC, "Dados de mercado"). Downloads public market data and publishes it in
// public/data/, next to the app. A source that fails keeps its previous file and is marked late
// in meta.json; the other sources go on. A source that answers with data older than the app's
// limit is reported late too. Touches only public data, never anything personal.
//
// Usage: node update.ts [--full]   (Node >= 22.18). --full downloads every series from the start.
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import type {
  B3File,
  CryptoFile,
  HolidaysFile,
  IndicesFile,
  MarketSource,
  MetaFile,
  SourceStatus,
  ThermometerFile,
  TreasuryFile,
} from '../src/market/files.ts';
import { MARKET_SOURCES } from '../src/market/files.ts';
import {
  STALE_AFTER_BUSINESS_DAYS,
  addDays,
  businessDaysBetween,
  decode,
  fetchBytes,
  fetchOk,
  isoToBr,
  normalizeDecimal,
  readJson,
  saoPauloDay,
  weekday,
  writeJson,
  type IsoDate,
} from './lib.ts';
import {
  changePoints,
  checkDailyRates,
  latestBonds,
  mercadoBitcoinPrices,
  mercadoBitcoinSymbols,
  mergeRows,
  parseCotahist,
  parseHolidays,
  parseSgs,
  parseTesouroCsv,
  thermometerSeries,
  type Row,
} from './parse.ts';

const OUT_DIR = fileURLToPath(new URL('../public/data/', import.meta.url));
const file = (name: string) => `${OUT_DIR}${name}.json`;

const FULL = process.argv.includes('--full');
const TODAY = saoPauloDay();
const NOW = new Date().toISOString();
/** First day of the daily Central Bank series. Older lots fall back to the bank balance. */
const SERIES_START = '2010-01-01';
/** Days downloaded again each night, so revisions by the source replace what was published. */
const REFRESH_DAYS = 60;

const notes: string[] = [];
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const previousMeta = readJson(file('meta')) as MetaFile | undefined;

// ---------- Banco Central, SGS ----------

async function sgs(code: number, from: IsoDate, to: IsoDate): Promise<Row[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${isoToBr(from)}&dataFinal=${isoToBr(to)}`;
  const text = decode(await fetchOk(url, { timeoutMs: 60_000, retries: 2 })).trim();
  // On a server-side timeout the SGS answers an HTML page with status 200.
  if (!text.startsWith('[')) throw new Error(`SGS ${code} não respondeu JSON (${isoToBr(from)} a ${isoToBr(to)})`);
  return parseSgs(JSON.parse(text), TODAY);
}

/**
 * Daily series accept windows of at most 10 years (docs/sources.md), so long ranges go in
 * slices. Series with weekends, such as the Selic target, need shorter ones to answer in time.
 */
async function sgsSliced(code: number, from: IsoDate, to: IsoDate, sliceYears = 9): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = from; start <= to; ) {
    const end = addDays(start, sliceYears * 365) < to ? addDays(start, sliceYears * 365) : to;
    rows.push(...(await sgs(code, start, end)));
    start = addDays(end, 1);
  }
  return rows;
}

/** A daily series: the last REFRESH_DAYS again, merged into what was published, or all of it. */
async function dailySeries(code: number, previous: Row[] | undefined): Promise<Row[]> {
  const last = previous?.at(-1)?.[0];
  if (FULL || !last) return sgsSliced(code, SERIES_START, TODAY);
  const from = addDays(last, -REFRESH_DAYS);
  return mergeRows(previous!, await sgs(code, from, TODAY), from);
}

async function updateIndices(): Promise<IsoDate> {
  const previous = readJson(file('indices')) as IndicesFile | undefined;
  const usable = previous?.version === 1 ? previous : undefined;

  const cdi = await dailySeries(12, usable?.cdi);
  checkDailyRates(cdi, 'CDI');
  const selic = await dailySeries(11, usable?.selic);
  checkDailyRates(selic, 'Selic');

  // The Selic target is a daily series that repeats the rate; only the changes are published.
  let selicTarget: Row[];
  if (FULL || !usable?.selicTarget.length) {
    selicTarget = changePoints(await sgsSliced(432, SERIES_START, TODAY, 3));
  } else {
    const from = addDays(TODAY, -REFRESH_DAYS);
    selicTarget = changePoints(await sgs(432, from, TODAY), usable.selicTarget.filter(r => r[0] < from));
  }

  const ipca: Row[] = (await sgs(433, SERIES_START, TODAY)).map(([date, value]) => [date.slice(0, 7), value]);
  const ptax = await sgs(1, addDays(TODAY, -730), TODAY);
  if (!selicTarget.length || ipca.length < 100 || ptax.length < 100) throw new Error('série do SGS incompleta');

  const asOf = cdi.at(-1)![0];
  const out: IndicesFile = { version: 1, asOf, cdi, selic, selicTarget, ipca, ptax };
  writeJson(file('indices'), out);
  return asOf;
}

// ---------- Tesouro Transparente ----------

const TESOURO_PACKAGE =
  'https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto';

async function updateTreasury(): Promise<IsoDate> {
  // The package lists the CSV's current address, so a moved file does not break the routine.
  const pkg = JSON.parse(decode(await fetchOk(TESOURO_PACKAGE))) as { result?: { resources?: { url: string; format?: string }[] } };
  const csvUrl = pkg.result?.resources?.find(r => r.format?.toUpperCase() === 'CSV' || r.url.toLowerCase().endsWith('.csv'))?.url;
  if (!csvUrl) throw new Error('CSV não encontrado no pacote do Tesouro Transparente');
  const rows = parseTesouroCsv(decode(await fetchOk(csvUrl, { timeoutMs: 300_000, retries: 2 }), 'latin1'));

  const { asOf, bonds, unknown } = latestBonds(rows);
  if (unknown.length) notes.push(`Tesouro: tipos novos ignorados: ${unknown.join(', ')}`);
  // Never replaces newer data with older data.
  const previous = readJson(file('treasury')) as TreasuryFile | undefined;
  if (previous?.version === 1 && previous.asOf > asOf) return previous.asOf;

  const thermometer: ThermometerFile = {
    version: 1,
    asOf,
    lookbackYears: 10,
    series: {
      rfIpcaLonga: thermometerSeries(rows, 'Tesouro IPCA+', 10, 10),
      rfPrefixada: thermometerSeries(rows, 'Tesouro Prefixado', 3, 10),
    },
  };
  writeJson(file('treasury'), { version: 1, asOf, bonds } satisfies TreasuryFile);
  writeJson(file('thermometer'), thermometer);
  return asOf;
}

// ---------- B3, COTAHIST ----------

async function updateB3(): Promise<IsoDate> {
  const previous = readJson(file('b3')) as B3File | undefined;
  // A day without a session answers 404, so the routine steps back to the last one.
  for (let day = TODAY, tries = 0; tries < 10; tries++, day = addDays(day, -1)) {
    if (weekday(day) === 0 || weekday(day) === 6) continue;
    const tag = day.split('-').reverse().join('');
    const res = await fetchBytes(`https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D${tag}.ZIP`, { timeoutMs: 120_000 });
    const isZip = res.bytes[0] === 0x50 && res.bytes[1] === 0x4b;
    if (res.status === 404 || (res.status === 200 && !isZip)) continue;
    if (res.status !== 200) throw new Error(`HTTP ${res.status} no COTAHIST de ${day}`);

    const [text] = Object.values(unzipSync(res.bytes));
    if (!text) throw new Error(`COTAHIST de ${day} vazio`);
    const { asOf, items, skipped } = parseCotahist(decode(text, 'latin1'));
    if (skipped) notes.push(`B3: ${skipped} linhas fora do formato ignoradas`);
    if (previous?.version === 1 && previous.asOf > asOf) return previous.asOf;
    writeJson(file('b3'), { version: 1, asOf, items } satisfies B3File);
    return asOf;
  }
  throw new Error('nenhum COTAHIST nos últimos 10 dias');
}

// ---------- ANBIMA ----------

/** The list runs to 2099, so a monthly download is enough (docs/sources.md). */
const HOLIDAYS_MAX_AGE_DAYS = 28;

async function updateHolidays(): Promise<IsoDate> {
  const previous = readJson(file('holidays')) as HolidaysFile | undefined;
  if (!FULL && previous?.version === 1 && previous.asOf >= addDays(TODAY, -HOLIDAYS_MAX_AGE_DAYS)) return previous.asOf;
  const bytes = await fetchOk('https://www.anbima.com.br/feriados/arqs/feriados_nacionais.xls');
  const book = XLSX.read(bytes, { type: 'array' });
  const sheet = book.Sheets[book.SheetNames[0]!]!;
  const dates = parseHolidays(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true }));
  if (dates.at(-1)! < addDays(TODAY, 365 * 5)) throw new Error(`ANBIMA: lista acaba em ${dates.at(-1)}`);
  writeJson(file('holidays'), { version: 1, asOf: TODAY, dates } satisfies HolidaysFile);
  return TODAY;
}

// ---------- Crypto (optional) ----------

const MB = 'https://api.mercadobitcoin.net/api/v4';
/** Coinbase is the backup when Mercado Bitcoin fails; it is asked one asset at a time. */
const COINBASE_ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'USDT', 'USDC', 'ADA', 'DOGE', 'LTC', 'LINK', 'DOT', 'AVAX'];

async function mercadoBitcoin(): Promise<Record<string, string>> {
  const symbols = mercadoBitcoinSymbols(JSON.parse(decode(await fetchOk(`${MB}/symbols`))));
  const tickers: unknown[] = [];
  for (let i = 0; i < symbols.length; i += 100) {
    const batch = symbols.slice(i, i + 100).join(',');
    tickers.push(...(JSON.parse(decode(await fetchOk(`${MB}/tickers?symbols=${batch}`))) as unknown[]));
  }
  return mercadoBitcoinPrices(tickers);
}

async function coinbase(): Promise<Record<string, string>> {
  const prices: Record<string, string> = {};
  for (const asset of COINBASE_ASSETS) {
    try {
      const json = JSON.parse(decode(await fetchOk(`https://api.coinbase.com/v2/prices/${asset}-BRL/spot`))) as {
        data?: { amount?: string };
      };
      if (json.data?.amount && Number(json.data.amount) > 0) prices[asset] = normalizeDecimal(json.data.amount);
    } catch {
      // An asset missing from the backup is shown without a price.
    }
  }
  if (!prices['BTC']) throw new Error('Coinbase sem BTC');
  return prices;
}

async function updateCrypto(): Promise<IsoDate> {
  let out: CryptoFile;
  try {
    out = { version: 1, asOf: TODAY, source: 'mercadobitcoin', prices: await mercadoBitcoin() };
  } catch (e) {
    notes.push(`Cripto: Mercado Bitcoin falhou (${message(e)}); usada a Coinbase`);
    out = { version: 1, asOf: TODAY, source: 'coinbase', prices: await coinbase() };
  }
  writeJson(file('crypto'), out);
  return TODAY;
}

// ---------- main ----------

const UPDATES: Record<MarketSource, () => Promise<IsoDate>> = {
  indices: updateIndices,
  treasury: updateTreasury,
  b3: updateB3,
  holidays: updateHolidays,
  crypto: updateCrypto,
};
/** Crypto is optional (SPEC): its failure does not mark the run as failed. */
const OPTIONAL: readonly MarketSource[] = ['crypto'];

const sources = {} as Record<MarketSource, SourceStatus>;
await Promise.all(
  MARKET_SOURCES.map(async id => {
    try {
      sources[id] = { ok: true, asOf: await UPDATES[id](), updatedAt: NOW };
    } catch (e) {
      const before = previousMeta?.sources?.[id];
      sources[id] = { ok: false, asOf: before?.asOf ?? null, updatedAt: before?.updatedAt ?? null, error: message(e) };
    }
  }),
);
const ordered = Object.fromEntries(MARKET_SOURCES.map(id => [id, sources[id]])) as Record<MarketSource, SourceStatus>;
writeJson(file('meta'), { version: 1, generatedAt: NOW, sources: ordered } satisfies MetaFile);

// A source can answer without error and bring nothing new, as the Tesouro Transparente did from
// 16/10/2026 while every run passed. Past the app's limit it counts as late, but meta.json keeps
// ok, because the app already judges the age itself. The holiday list runs to 2099, so its date
// says nothing about the market.
const holidays = new Set((readJson(file('holidays')) as HolidaysFile | undefined)?.dates ?? []);
const ageOf = (id: MarketSource): number | null => {
  const asOf = ordered[id].asOf;
  return asOf && id !== 'holidays' ? businessDaysBetween(asOf, TODAY, holidays) : null;
};
const isStale = (id: MarketSource) => (ageOf(id) ?? 0) > STALE_AFTER_BUSINESS_DAYS;

const report = [
  `## Dados de mercado, ${isoToBr(TODAY)}${FULL ? ' (completo)' : ''}`,
  '',
  '| Fonte | Resultado | Dado de | Erro |',
  '| --- | --- | --- | --- |',
  ...MARKET_SOURCES.map(id => {
    const s = ordered[id];
    const stale = isStale(id) ? `dado com ${ageOf(id)} dias úteis, acima do limite de ${STALE_AFTER_BUSINESS_DAYS}` : '';
    const problems = [s.error, stale].filter(Boolean).join('; ');
    return `| ${id} | ${s.ok && !stale ? 'OK' : 'ATRASADA'} | ${s.asOf ? isoToBr(s.asOf) : '-'} | ${problems} |`;
  }),
  ...(notes.length ? ['', ...notes.map(n => `- ${n}`)] : []),
  '',
].join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
process.exitCode = MARKET_SOURCES.every(id => (ordered[id].ok && !isStale(id)) || OPTIONAL.includes(id)) ? 0 : 1;
