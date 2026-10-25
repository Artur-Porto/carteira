// Calendar, tax tables and pension vesting, at their edges.
import { describe, expect, it } from 'vitest';
import { BusinessCalendar, addMonths, addYears, completedYears, daysBetween } from '../../src/domain/calendar';
import { latestBalance, pensionStatus, vestedPct } from '../../src/domain/pension';
import { TAX_RULES, fixedIncomeIrPct, fixedIncomeTax, iofPct } from '../../src/domain/tax';
import type { PensionPlan } from '../../src/domain/types';

describe('calendar', () => {
  it('counts years and months as Lei 810/1949 does', () => {
    expect(addYears('2023-03-01', 2)).toBe('2025-03-01');
    // No 29/02 in 2025: the year ends on the first day after it.
    expect(addYears('2024-02-29', 1)).toBe('2025-03-01');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-03-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(completedYears('2024-02-29', '2025-02-28')).toBe(0);
    expect(completedYears('2024-02-29', '2025-03-01')).toBe(1);
    expect(completedYears('2023-03-01', '2023-01-01')).toBe(0);
  });

  it('counts business days between dates, start included and end excluded', () => {
    const cal = new BusinessCalendar(['2026-11-02', '2026-11-20']);
    expect(cal.isBusinessDay('2026-11-02')).toBe(false);
    expect(cal.isBusinessDay('2026-11-07')).toBe(false);
    expect(cal.businessDaysBetween('2026-10-30', '2026-11-04')).toBe(2);
    expect(cal.businessDaysBetween('2026-11-04', '2026-11-04')).toBe(0);
    expect(cal.addBusinessDays('2026-10-30', 1)).toBe('2026-11-03');
    expect(cal.addBusinessDays('2026-11-03', -1)).toBe('2026-10-30');
    expect(daysBetween('2025-01-06', '2026-12-28')).toBe(721);
  });
});

describe('fixed income tax tables', () => {
  it('applies the income-tax bracket of each holding period', () => {
    expect([1, 180, 181, 360, 361, 720, 721].map(d => fixedIncomeIrPct(d).toString())).toEqual([
      '22.5', '22.5', '20', '20', '17.5', '17.5', '15',
    ]);
  });

  it('charges IOF on the yield of the first 29 days only', () => {
    expect([0, 1, 2, 15, 29, 30, 31].map(iofPct)).toEqual([96, 96, 93, 50, 3, 0, 0]);
  });

  it('takes IOF before income tax and spares LCI and LCA', () => {
    expect(fixedIncomeTax('CDB', 10_000, 15)).toEqual({ iofCents: 5_000, irCents: 1_125 });
    expect(fixedIncomeTax('LCI', 10_000, 15)).toEqual({ iofCents: 5_000, irCents: 0 });
    expect(fixedIncomeTax('LCA', 10_000, 15)).toEqual({ iofCents: 0, irCents: 0 });
    expect(fixedIncomeTax('CDB', -500, 15)).toEqual({ iofCents: 0, irCents: 0 });
  });

  it('records when and where every rule was checked, in an official source', () => {
    for (const rule of TAX_RULES) {
      expect(rule.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Planalto for laws and decrees; the FGC publishes its own regulation, approved by the CMN.
      expect(rule.source.url).toMatch(/^https:\/\/www\.(planalto\.gov\.br|fgc\.org\.br)\//);
    }
  });
});

const STAMP = { createdAt: '2026-10-19T12:00:00.000Z', updatedAt: '2026-10-19T12:00:00.000Z' };
const plan: PensionPlan = {
  id: 'plano',
  name: 'PGBL fictício',
  startDate: '2023-03-01',
  ownMonthlyCents: 80_000,
  matchPct: 100,
  vestingTable: [
    { years: 4, pct: 40 },
    { years: 2, pct: 20 },
    { years: 6, pct: 60 },
    { years: 8, pct: 80 },
    { years: 10, pct: 100 },
  ],
  balances: [
    { date: '2026-08-31', ownCents: 3_000_000, companyCents: 3_000_000 },
    { date: '2026-09-30', ownCents: 3_100_000, companyCents: 3_100_000 },
  ],
  composition: {},
  fees: { adminPct: 0.8, loadingPct: 0 },
  taxRegime: 'regressivo',
  ...STAMP,
};

describe('pension vesting (SPEC, mandatory test)', () => {
  it('releases each step on the plan anniversary, not a day before', () => {
    expect(vestedPct(plan, '2025-02-28')).toBe(0);
    expect(vestedPct(plan, '2025-03-01')).toBe(20);
    expect(vestedPct(plan, '2027-02-28')).toBe(20);
    expect(vestedPct(plan, '2027-03-01')).toBe(40);
    expect(vestedPct(plan, '2033-03-01')).toBe(100);
  });

  it('counts a plan started on 29/02 by Lei 810', () => {
    const leap = { startDate: '2024-02-29', vestingTable: [{ years: 1, pct: 50 }] };
    expect(vestedPct(leap, '2025-02-28')).toBe(0);
    expect(vestedPct(leap, '2025-03-01')).toBe(50);
  });

  it('keeps the last step reached when the table skips years', () => {
    const sparse = { startDate: '2020-01-10', vestingTable: [{ years: 3, pct: 30 }, { years: 9, pct: 90 }] };
    expect(vestedPct(sparse, '2025-06-01')).toBe(30);
  });

  it('adds the released company part to the own part and shows the next step', () => {
    expect(latestBalance(plan)?.date).toBe('2026-09-30');
    expect(pensionStatus(plan, '2026-10-19')).toEqual({
      balance: { date: '2026-09-30', ownCents: 3_100_000, companyCents: 3_100_000 },
      vestedPct: 20,
      guaranteedCents: 3_720_000,
      nextStep: { date: '2027-03-01', pct: 40, releasesCents: 620_000 },
    });
    expect(pensionStatus({ ...plan, balances: [] }, '2034-01-01')).toMatchObject({ guaranteedCents: 0, nextStep: null });
  });
});
