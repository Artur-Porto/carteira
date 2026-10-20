// Numbers typed in Brazilian format, read without floating point.
import type { Cents } from '../domain/types';

/**
 * "1.234,56", "1234,56", "R$ 1.234" and "1234.56" as text with a dot, such as "1234.56"; null
 * when it is not a number. A lone dot followed by one or two digits is a decimal point, as a
 * keyboard in English would type it; otherwise dots group thousands.
 */
export function readDecimal(input: string, maxDecimals: number): string | null {
  let t = input.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!t) return null;
  const negative = t.startsWith('-');
  if (negative) t = t.slice(1);
  if (t.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*(,\d*)?$|^\d+(,\d*)?$/.test(t)) return null;
    t = t.replaceAll('.', '').replace(',', '.');
  } else if (/^0\.\d+$/.test(t) || (/^\d+\.\d{1,2}$/.test(t) && !/^\d{1,3}\.\d{3}$/.test(t))) {
    // "0.005" and "1234.56" have a decimal point, not a thousands separator.
  } else {
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(t)) return null;
    t = t.replaceAll('.', '');
  }
  if (t.endsWith('.')) t = t.slice(0, -1);
  const [int = '0', frac = ''] = t.split('.');
  if (frac.length > maxDecimals) return null;
  const clean = `${int.replace(/^0+(?=\d)/, '')}${frac.replace(/0+$/, '') ? `.${frac.replace(/0+$/, '')}` : ''}`;
  return negative && clean !== '0' ? `-${clean}` : clean;
}

/** Reais typed by the owner, as integer centavos; null when it is not an amount. */
export function readCents(input: string): Cents | null {
  const value = readDecimal(input, 2);
  if (value === null) return null;
  const [int, frac = ''] = value.replace('-', '').split('.') as [string, string?];
  const cents = Number(int) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return value.startsWith('-') ? -cents : cents;
}

/** Centavos as text for an input, such as "1.234,56", without the currency sign. */
export function centsInput(cents: Cents): string {
  const abs = Math.abs(cents);
  const reais = (abs - (abs % 100)) / 100;
  return `${cents < 0 ? '-' : ''}${reais.toLocaleString('pt-BR')},${String(abs % 100).padStart(2, '0')}`;
}

/** Decimal text such as "1234.5" in Brazilian format, "1.234,5", grouping the thousands. */
export function decimalBr(value: string): string {
  const negative = value.startsWith('-');
  const [int = '0', frac] = value.replace('-', '').split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}
