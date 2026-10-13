// Milestone 0 probe: checks every public market-data source the app depends on.
// Runs locally and on a GitHub Actions runner. Touches only public market data.
// Usage: node probe.ts   (Node >= 22.18 strips TypeScript types natively)

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import * as XLSX from 'xlsx';

type Result = {
  id: string;
  source: string;
  ok: boolean;
  httpStatus?: number;
  bytes?: number;
  ms?: number;
  latest?: string;
  facts: Record<string, unknown>;
  notes: string[];
  error?: string;
};

const UA = 'carteira-pipeline-probe/0 (public market data; personal PWA)';
const TZ = 'America/Sao_Paulo';

function todaySP(): Date {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  return new Date(`${iso}T12:00:00Z`);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ddmmyyyy = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const brToIso = (s: string) => { const [d, m, y] = s.split('/'); return `${y}-${m}-${d}`; };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

async function get(url: string, timeoutMs = 120_000) {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
  const buf = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, ok: res.ok, buf, ms: Math.round(performance.now() - t0), type: res.headers.get('content-type') ?? '' };
}
const text = (b: Uint8Array, enc = 'utf-8') => new TextDecoder(enc).decode(b);

async function run(id: string, source: string, fn: (r: Result) => Promise<void>): Promise<Result> {
  const r: Result = { id, source, ok: false, facts: {}, notes: [] };
  try { await fn(r); } catch (e) { r.ok = false; r.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e); }
  return r;
}

// ---------- Banco Central SGS ----------
const SGS = { cdi: 12, selicMeta: 432, ipca: 433, ptaxVenda: 1 } as const;

async function probeSgs(name: keyof typeof SGS): Promise<Result> {
  const code = SGS[name];
  return run(`sgs-${name}`, `BCB SGS ${code}`, async r => {
    const res = await get(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/5?formato=json`, 30_000);
    Object.assign(r, { httpStatus: res.status, bytes: res.buf.length, ms: res.ms });
    const rows = JSON.parse(text(res.buf)) as { data: string; valor: string }[];
    if (!Array.isArray(rows) || !rows.every(x => /^\d{2}\/\d{2}\/\d{4}$/.test(x.data) && /^-?\d+(\.\d+)?$/.test(x.valor)))
      throw new Error('formato inesperado');
    const last = rows[rows.length - 1];
    r.latest = brToIso(last.data);
    r.facts = { formato: '[{data:"dd/mm/aaaa", valor:"decimal com ponto, em texto"}]', ultimo: last };
    if (r.latest > iso(todaySP())) r.notes.push(`série traz datas futuras (até ${r.latest}): filtrar data <= hoje`);
    r.ok = true;
  });
}

async function probeSgsWindow(): Promise<Result> {
  return run('sgs-window', 'BCB SGS 12 (janela de 10 anos)', async r => {
    const end = todaySP();
    const start10 = new Date(Date.UTC(end.getUTCFullYear() - 10, end.getUTCMonth(), end.getUTCDate() + 1, 12));
    const start11 = new Date(Date.UTC(end.getUTCFullYear() - 11, end.getUTCMonth(), end.getUTCDate(), 12));
    const base = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataFinal=${ddmmyyyy(end)}&dataInicial=`;
    const a = await get(base + ddmmyyyy(start10), 60_000);
    const b = await get(base + ddmmyyyy(start11), 60_000);
    const rowsA = a.ok ? (JSON.parse(text(a.buf)) as unknown[]).length : 0;
    Object.assign(r, { httpStatus: a.status, bytes: a.buf.length, ms: a.ms });
    r.facts = { janela10anos: { status: a.status, linhas: rowsA }, janela11anos: { status: b.status, resposta: text(b.buf).slice(0, 120) } };
    r.ok = a.ok && rowsA > 2000;
    if (!b.ok) r.notes.push('janela > 10 anos é recusada: histórico diário precisa ser baixado em fatias');
  });
}

// ---------- Tesouro Transparente ----------
type TdRow = { type: string; maturity: string; base: string; rate: number };

function parseTesouro(csv: string): TdRow[] {
  const lines = csv.split(/\r?\n/);
  const header = lines[0].split(';');
  const expected = ['Tipo Titulo', 'Data Vencimento', 'Data Base', 'Taxa Compra Manha', 'Taxa Venda Manha', 'PU Compra Manha', 'PU Venda Manha', 'PU Base Manha'];
  if (header.join('|') !== expected.join('|')) throw new Error(`cabeçalho mudou: ${header.join('|')}`);
  const out: TdRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(';');
    if (c.length < 5) continue;
    const buy = Number(c[3].replace(',', '.'));
    const sell = Number(c[4].replace(',', '.'));
    const rate = buy > 0 ? buy : sell;
    if (!Number.isFinite(rate)) continue;
    out.push({ type: c[0], maturity: brToIso(c[1]), base: brToIso(c[2]), rate });
  }
  return out;
}

// For each base date, pick the bond of `type` whose time to maturity is closest to `years`.
function constantTenorSeries(rows: TdRow[], type: string, years: number) {
  const best = new Map<string, { gap: number; rate: number; maturity: string }>();
  for (const r of rows) {
    if (r.type !== type || r.rate <= 0) continue;
    const t = (Date.parse(r.maturity) - Date.parse(r.base)) / (365.25 * 86_400_000);
    const gap = Math.abs(t - years);
    const cur = best.get(r.base);
    if (!cur || gap < cur.gap) best.set(r.base, { gap, rate: r.rate, maturity: r.maturity });
  }
  return [...best.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));
}

function percentileOfLast(series: { date: string; rate: number }[], lookbackYears: number) {
  const last = series[series.length - 1];
  const from = iso(new Date(Date.parse(last.date) - lookbackYears * 365.25 * 86_400_000));
  const window = series.filter(p => p.date >= from).map(p => p.rate);
  const below = window.filter(v => v < last.rate).length;
  const equal = window.filter(v => v === last.rate).length;
  return {
    data: last.date, taxa: last.rate,
    percentil: Math.round(((below + equal / 2) / window.length) * 1000) / 10,
    observacoes: window.length, min: Math.min(...window), max: Math.max(...window), desde: from,
  };
}

async function probeTesouro(): Promise<Result> {
  return run('tesouro', 'Tesouro Transparente (CKAN)', async r => {
    const meta = await get('https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto', 60_000);
    const pkg = JSON.parse(text(meta.buf)) as { result: { resources: { url: string; format: string; last_modified: string | null }[] } };
    const res = pkg.result.resources.find(x => x.url.toLowerCase().endsWith('.csv'));
    if (!res) throw new Error('recurso CSV não encontrado no pacote CKAN');
    const csv = await get(res.url, 300_000);
    Object.assign(r, { httpStatus: csv.status, bytes: csv.buf.length, ms: csv.ms });
    const rows = parseTesouro(text(csv.buf, 'latin1'));
    const types = [...new Set(rows.map(x => x.type))].sort();
    const dates = rows.map(x => x.base).sort();
    r.latest = dates[dates.length - 1];
    const ipca10 = constantTenorSeries(rows, 'Tesouro IPCA+', 10);
    const pre3 = constantTenorSeries(rows, 'Tesouro Prefixado', 3);
    r.facts = {
      urlCsv: res.url, csvLastModified: res.last_modified, linhas: rows.length,
      primeiraData: dates[0], tipos: types,
      termometro: {
        ipcaMais10a: { ...percentileOfLast(ipca10, 10), vencimentoUsado: ipca10[ipca10.length - 1].maturity },
        prefixado3a: { ...percentileOfLast(pre3, 10), vencimentoUsado: pre3[pre3.length - 1].maturity },
      },
    };
    if (!types.some(t => /reserva/i.test(t))) r.notes.push('Tesouro Reserva não aparece no CSV: rende Selic, usar CDI/Selic do SGS');
    r.notes.push('CSV vem sem ordem, com decimal em vírgula, datas dd/mm/aaaa e codificação latin1');
    r.ok = rows.length > 100_000;
  });
}

// ---------- B3 COTAHIST ----------
// Fixed-width layout documented on the B3 "Cotações históricas" page (linked from SPEC.md).
const BDI: Record<string, string> = { '02': 'ações (lote padrão)', '12': 'FIIs', '14': 'ETFs e certificados', '34': 'BDR nível 1', '35': 'BDR nível 2', '36': 'BDR nível 3', '07': 'recuperação judicial', '08': 'regime especial' };

async function probeB3(): Promise<Result> {
  return run('b3-cotahist', 'B3 COTAHIST diário', async r => {
    let day = todaySP();
    for (let i = 0; i < 8; i++, day = addDays(day, -1)) {
      const dow = day.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const tag = ddmmyyyy(day).replaceAll('/', '');
      const res = await get(`https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D${tag}.ZIP`, 120_000);
      const isZip = res.buf[0] === 0x50 && res.buf[1] === 0x4b;
      if (!res.ok || !isZip) { r.notes.push(`D${tag}: HTTP ${res.status}${isZip ? '' : ', não é zip'}`); continue; }
      Object.assign(r, { httpStatus: res.status, bytes: res.buf.length, ms: res.ms });
      const files = unzipSync(res.buf);
      const name = Object.keys(files)[0];
      const lines = text(files[name], 'latin1').split(/\r?\n/);
      const counts: Record<string, number> = {};
      const sample: Record<string, number> = {};
      const want = new Set(['PETR4', 'BOVA11', 'IVVB11', 'HGLG11', 'BITH11', 'AAPL34']);
      for (const l of lines) {
        if (!l.startsWith('01') || l.slice(24, 27) !== '010') continue;
        const bdi = l.slice(10, 12);
        counts[BDI[bdi] ?? `BDI ${bdi}`] = (counts[BDI[bdi] ?? `BDI ${bdi}`] ?? 0) + 1;
        const tk = l.slice(12, 24).trim();
        if (want.has(tk)) sample[tk] = Number(l.slice(108, 121)) / 100;
      }
      r.latest = `${lines[0].slice(23, 27)}-${lines[0].slice(27, 29)}-${lines[0].slice(29, 31)}`;
      r.facts = { arquivo: name, tamanhoTxt: files[name].length, mercadoAVistaPorBdi: counts, fechamentoExemplo: sample };
      r.notes.push('largura fixa de 245 colunas; preços com 2 casas implícitas; filtrar TPMERC 010 e BDI 02/12/14/34-36');
      r.ok = Object.keys(sample).length >= 4;
      return;
    }
    throw new Error('nenhum COTAHIST diário encontrado nos últimos 8 dias');
  });
}

// ---------- ANBIMA holidays ----------
async function probeAnbima(): Promise<Result> {
  return run('anbima-feriados', 'ANBIMA feriados nacionais (.xls)', async r => {
    const res = await get('https://www.anbima.com.br/feriados/arqs/feriados_nacionais.xls', 60_000);
    Object.assign(r, { httpStatus: res.status, bytes: res.buf.length, ms: res.ms });
    const wb = XLSX.read(res.buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });
    const holidays = rows
      .filter(x => x[0] instanceof Date)
      .map(x => ({ date: iso(new Date((x[0] as Date).getTime() + 12 * 3_600_000)), name: String(x[2] ?? '').trim() }));
    const today = iso(todaySP());
    const years = holidays.map(h => h.date.slice(0, 4));
    r.latest = holidays[holidays.length - 1]?.date;
    r.facts = { cabecalho: rows[0], total: holidays.length, deAno: years[0], ateAno: years[years.length - 1], proximos: holidays.filter(h => h.date >= today).slice(0, 4) };
    r.ok = holidays.length > 500 && r.latest !== undefined && r.latest > today;
  });
}

// ---------- Crypto (optional) ----------
async function probeCrypto(id: string, source: string, url: string, pick: (j: unknown) => Record<string, number>): Promise<Result> {
  return run(id, source, async r => {
    const res = await get(url, 30_000);
    Object.assign(r, { httpStatus: res.status, bytes: res.buf.length, ms: res.ms });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text(res.buf).slice(0, 160)}`);
    r.facts = { precosBRL: pick(JSON.parse(text(res.buf))) };
    r.ok = Object.values(r.facts.precosBRL as Record<string, number>).every(v => v > 0);
  });
}

// ---------- main ----------
const env = process.env.GITHUB_ACTIONS ? `GitHub Actions (${process.env.RUNNER_OS ?? '?'} ${process.env.ImageOS ?? ''})` : 'máquina local';
const startedAt = new Date().toISOString();
const results = await Promise.all([
  probeSgs('cdi'), probeSgs('selicMeta'), probeSgs('ipca'), probeSgs('ptaxVenda'), probeSgsWindow(),
  probeTesouro(), probeB3(), probeAnbima(),
  probeCrypto('crypto-mb', 'Mercado Bitcoin API v4', 'https://api.mercadobitcoin.net/api/v4/tickers?symbols=BTC-BRL,ETH-BRL',
    j => Object.fromEntries((j as { pair: string; last: string }[]).map(x => [x.pair, Number(x.last)]))),
  probeCrypto('crypto-binance', 'Binance API v3', 'https://api.binance.com/api/v3/ticker/price?symbols=%5B%22BTCBRL%22,%22ETHBRL%22%5D',
    j => Object.fromEntries((j as { symbol: string; price: string }[]).map(x => [x.symbol, Number(x.price)]))),
  probeCrypto('crypto-coinbase', 'Coinbase API v2', 'https://api.coinbase.com/v2/prices/BTC-BRL/spot',
    j => ({ 'BTC-BRL': Number((j as { data: { amount: string } }).data.amount) })),
]);

const md = [
  `## Sondagem das fontes — ${env}`,
  `Início: ${startedAt}`,
  '',
  '| Fonte | Resultado | HTTP | Tamanho | Tempo | Dado mais recente |',
  '| --- | --- | --- | --- | --- | --- |',
  ...results.map(r => `| ${r.source} | ${r.ok ? 'OK' : 'FALHOU'} | ${r.httpStatus ?? '-'} | ${r.bytes ? `${(r.bytes / 1024).toFixed(0)} KB` : '-'} | ${r.ms ?? '-'} ms | ${r.latest ?? '-'} |`),
  '',
  ...results.flatMap(r => [`### ${r.source}`, ...(r.error ? [`Erro: \`${r.error}\``] : []), ...r.notes.map(n => `- ${n}`), '```json', JSON.stringify(r.facts, null, 2), '```', '']),
].join('\n');

mkdirSync('out', { recursive: true });
writeFileSync('out/probe-report.json', JSON.stringify({ env, startedAt, results }, null, 2));
writeFileSync('out/probe-report.md', md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);

// Optional sources must not fail the run; required ones must.
const required = results.filter(r => !r.id.startsWith('crypto-'));
const cryptoOk = results.some(r => r.id.startsWith('crypto-') && r.ok);
process.exitCode = required.every(r => r.ok) && cryptoOk ? 0 : 1;
