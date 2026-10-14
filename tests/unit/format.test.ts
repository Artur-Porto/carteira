import { describe, expect, it } from 'vitest';
import { saoPauloDay } from '../../src/domain/dates';
import { formatCents, formatDate } from '../../src/ui/format';

describe('Brazilian formats', () => {
  it('formats centavos as reais', () => {
    expect(formatCents(0)).toBe('R$ 0,00');
    expect(formatCents(100)).toBe('R$ 1,00');
    expect(formatCents(123_456_789)).toBe('R$ 1.234.567,89');
    expect(formatCents(-5)).toBe('-R$ 0,05');
    expect(() => formatCents(1.5)).toThrow();
  });

  it('formats dates as dd/mm/aaaa', () => {
    expect(formatDate('2026-10-13')).toBe('13/10/2026');
  });

  it('uses the São Paulo calendar day', () => {
    expect(saoPauloDay(new Date('2026-10-14T02:30:00Z'))).toBe('2026-10-13');
    expect(saoPauloDay(new Date('2026-10-14T03:30:00Z'))).toBe('2026-10-14');
  });
});
