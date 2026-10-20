import { describe, expect, it } from 'vitest';
import { centsInput, decimalBr, readCents, readDecimal } from '../../src/ui/input';

describe('numbers typed in Brazilian format', () => {
  it('reads amounts in reais as centavos', () => {
    expect(readCents('1.234,56')).toBe(123_456);
    expect(readCents('1234,56')).toBe(123_456);
    expect(readCents('R$ 1.234')).toBe(123_400);
    expect(readCents('1234.56')).toBe(123_456);
    expect(readCents('1.234')).toBe(123_400);
    expect(readCents('1.000.000,5')).toBe(100_000_050);
    expect(readCents(' 15,')).toBe(1_500);
    expect(readCents('0,05')).toBe(5);
  });

  it('refuses what is not an amount', () => {
    for (const text of ['', 'abc', '1,2,3', '1.23,4', '12,345', '1.2345', '--5']) expect(readCents(text)).toBeNull();
  });

  it('reads quantities and rates with more decimals', () => {
    expect(readDecimal('0,005', 8)).toBe('0.005');
    // With a leading zero, a dot is a decimal point even when a keyboard in English typed it.
    expect(readDecimal('0.005', 8)).toBe('0.005');
    expect(readDecimal('2,85', 8)).toBe('2.85');
    expect(readDecimal('110', 4)).toBe('110');
    expect(readDecimal('12,30', 4)).toBe('12.3');
    expect(readDecimal('1.000', 8)).toBe('1000');
    expect(readDecimal('1,123456789', 8)).toBeNull();
  });

  it('writes amounts and decimals back in Brazilian format', () => {
    expect(centsInput(123_456)).toBe('1.234,56');
    expect(centsInput(5)).toBe('0,05');
    expect(decimalBr('1234.5')).toBe('1.234,5');
    expect(decimalBr('0.005')).toBe('0,005');
    expect(decimalBr('60')).toBe('60');
  });
});
