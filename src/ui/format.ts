import type { Cents, IsoDate, IsoDateTime } from '../domain/types';

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Centavos as reais, such as "R$ 1.234,56", without going through floating point. */
export function formatCents(cents: Cents): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`centavos inválidos: ${cents}`);
  const abs = Math.abs(cents);
  const reais = (abs - (abs % 100)) / 100;
  return `${cents < 0 ? '-' : ''}R$ ${integer.format(reais)},${String(abs % 100).padStart(2, '0')}`;
}

/** "2026-10-13" as "13/10/2026". */
export function formatDate(date: IsoDate): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** An instant as São Paulo date and time, such as "13/10/2026, 21:05". */
export function formatDateTime(instant: IsoDateTime): string {
  return dateTime.format(new Date(instant));
}

export function formatPct(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
