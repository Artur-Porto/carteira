// Helpers shared by the data routine. Pure apart from fetchBytes and writeJson.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type IsoDate = string;

const USER_AGENT = 'carteira-pipeline/1 (public market data; github.com/Artur-Porto/carteira)';
const DAY_MS = 86_400_000;

/** Calendar date in São Paulo for an instant (SPEC: dates are São Paulo dates). */
export function saoPauloDay(instant = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(instant);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekday(date: IsoDate): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** The app warns about data older than this (SPEC, "Dados de mercado"), and the routine fails. */
export const STALE_AFTER_BUSINESS_DAYS = 5;

/**
 * Business days d with from <= d < to: Monday to Friday, except holidays. The app's calendar
 * counts the same way, so data from the previous business day is 1 day old.
 */
export function businessDaysBetween(from: IsoDate, to: IsoDate, holidays: ReadonlySet<IsoDate>): number {
  let count = 0;
  for (let d = from; d < to; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd !== 0 && wd !== 6 && !holidays.has(d)) count++;
  }
  return count;
}

/** "dd/mm/aaaa" to "aaaa-mm-dd"; throws on anything else. */
export function brToIso(text: string): IsoDate {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) throw new Error(`data inválida: ${text}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function isoToBr(date: IsoDate): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** Decimal text such as "0,050788" or "1.234,5" in Brazilian format, normalized to "0.050788". */
export function brDecimal(text: string): string {
  const t = text.trim().replaceAll('.', '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`número inválido: ${text}`);
  return normalizeDecimal(t);
}

/** Drops redundant zeros: "413349.00000000" becomes "413349", "0.10" becomes "0.1". */
export function normalizeDecimal(text: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`número inválido: ${text}`);
  let [int, frac = ''] = text.split('.') as [string, string?];
  const negative = int.startsWith('-');
  int = int.replace('-', '').replace(/^0+(?=\d)/, '');
  frac = frac.replace(/0+$/, '');
  const out = frac ? `${int}.${frac}` : int;
  return negative && out !== '0' ? `-${out}` : out;
}

export interface Fetched {
  status: number;
  bytes: Uint8Array;
}

/** GET with a timeout and new attempts after network errors and 5xx answers. */
export async function fetchBytes(url: string, { timeoutMs = 60_000, retries = 2 } = {}): Promise<Fetched> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 2_000 * attempt));
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      return { status: res.status, bytes };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchOk(url: string, options?: { timeoutMs?: number; retries?: number }): Promise<Uint8Array> {
  const res = await fetchBytes(url, options);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.bytes;
}

export const decode = (bytes: Uint8Array, encoding = 'utf-8') => new TextDecoder(encoding).decode(bytes);

export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Writes JSON with one array item per line, so each daily commit shows what changed and git
 * stores small deltas. The first two levels of objects get one key per line.
 */
export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${format(data, 0)}\n`);
}

function format(value: unknown, depth: number): string {
  const pad = '  '.repeat(depth + 1);
  const end = '  '.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map(v => pad + JSON.stringify(v)).join(',\n')}\n${end}]`;
  }
  if (value !== null && typeof value === 'object' && depth < 2) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${format(v, depth + 1)}`).join(',\n')}\n${end}}`;
  }
  return JSON.stringify(value);
}
