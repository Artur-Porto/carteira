// Decimal arithmetic for rates and quantities (SPEC: "Taxas e quantidades com biblioteca decimal,
// nunca ponto flutuante"). Money stays in integer centavos and only meets decimals here.
import DecimalJs from 'decimal.js';
import type { Cents } from './types';

/** Own copy of the library, so its settings never leak into other code. */
export const Dec = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

export const ZERO = new Dec(0);
export const ONE = new Dec(1);

/** Decimal text as stored ("110", "0.005"); throws on anything that is not a plain number. */
export function dec(text: string | number): Dec {
  if (typeof text === 'string' && !/^-?\d+(\.\d+)?$/.test(text)) throw new RangeError(`número inválido: ${text}`);
  return new Dec(text);
}

/** Reais as a decimal, from integer centavos. */
export const reais = (cents: Cents): Dec => new Dec(cents).div(100);

/** Reais to centavos: rounded half up, or truncated toward zero where a rule asks for it. */
export function toCents(value: Dec, mode: 'round' | 'truncate' = 'round'): Cents {
  const cents = value.mul(100);
  return (mode === 'truncate' ? cents.trunc() : cents.toDecimalPlaces(0, Dec.ROUND_HALF_UP)).toNumber();
}

/** Centavos times a factor, such as an interest factor or a tax rate, back to centavos. */
export const scaleCents = (cents: Cents, factor: Dec, mode: 'round' | 'truncate' = 'round'): Cents =>
  toCents(reais(cents).mul(factor), mode);

/** A decimal as stored text, without exponent notation or trailing zeros. */
export const decText = (value: Dec): string => value.toFixed();
