// Tax rules (SPEC, "Parâmetros fiscais e limites"): the single parameter file, with the date each
// rule was checked against its official source. A rule enters here only after that check, in the
// milestone that first uses it; the app asks for a review every January.
import { Dec, dec, scaleCents } from './decimal';
import type { Cents, InstrumentType, IsoDate } from './types';

export interface TaxRule<T> {
  id: string;
  label: string;
  value: T;
  verifiedAt: IsoDate;
  source: { title: string; url: string };
}

const LEI_11033 = 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm';
const DECRETO_6306 = 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm';

/** Income tax on fixed income by holding period, in calendar days from application to redemption. */
export const FIXED_INCOME_IR: TaxRule<{ upToDays: number | null; ratePct: string }[]> = {
  id: 'ir-renda-fixa',
  label: 'IR da renda fixa (CDB, Tesouro): 22,5% até 180 dias; 20% de 181 a 360; 17,5% de 361 a 720; 15% acima de 720',
  value: [
    { upToDays: 180, ratePct: '22.5' },
    { upToDays: 360, ratePct: '20' },
    { upToDays: 720, ratePct: '17.5' },
    { upToDays: null, ratePct: '15' },
  ],
  verifiedAt: '2026-10-19',
  source: { title: 'Lei 11.033/2004, art. 1º (a MP 1.303/2025 perdeu a vigência)', url: LEI_11033 },
};

/** IOF on fixed income redeemed within 30 days, as a percentage of the yield. */
export const IOF_FIXED_INCOME: TaxRule<number[]> = {
  id: 'iof-renda-fixa',
  label: 'IOF no resgate antes de 30 dias: de 96% do rendimento no 1º dia a 3% no 29º; zero a partir do 30º',
  // Day 1, 2, ... 29 after the application.
  value: [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3],
  verifiedAt: '2026-10-19',
  source: { title: 'Decreto 6.306/2007, art. 32 e Anexo', url: DECRETO_6306 },
};

/** Fixed income whose yield is exempt from income tax for individuals. */
export const IR_EXEMPT: TaxRule<readonly InstrumentType[]> = {
  id: 'isencao-ir',
  label: 'LCI e LCA: isentas de IR para pessoa física',
  value: ['LCI', 'LCA'],
  verifiedAt: '2026-10-19',
  source: { title: 'Lei 11.033/2004, art. 3º, incisos II e IV', url: LEI_11033 },
};

/** Fixed income with a zero IOF rate. */
export const IOF_ZERO: TaxRule<readonly InstrumentType[]> = {
  id: 'iof-zero',
  label: 'LCA: IOF com alíquota zero',
  value: ['LCA'],
  verifiedAt: '2026-10-19',
  source: { title: 'Decreto 6.306/2007, art. 32, § 2º, inciso V', url: DECRETO_6306 },
};

export const TAX_RULES = [FIXED_INCOME_IR, IOF_FIXED_INCOME, IR_EXEMPT, IOF_ZERO] as const;

/** Income tax rate, in percent, for fixed income held `days` calendar days. */
export function fixedIncomeIrPct(days: number): Dec {
  const bracket = FIXED_INCOME_IR.value.find(b => b.upToDays === null || days <= b.upToDays)!;
  return dec(bracket.ratePct);
}

/** IOF rate, in percent of the yield, for a redemption `days` calendar days after the application. */
export function iofPct(days: number): number {
  if (days >= 30) return 0;
  return IOF_FIXED_INCOME.value[Math.max(days, 1) - 1]!;
}

export interface FixedIncomeTax {
  iofCents: Cents;
  irCents: Cents;
}

/**
 * Taxes withheld when a fixed income lot is redeemed: IOF first, limited to the yield, and then
 * income tax on the yield net of IOF. Both are rounded to the centavo.
 */
export function fixedIncomeTax(instrument: InstrumentType, gainCents: Cents, days: number): FixedIncomeTax {
  if (gainCents <= 0) return { iofCents: 0, irCents: 0 };
  const iofCents = IOF_ZERO.value.includes(instrument) ? 0 : scaleCents(gainCents, new Dec(iofPct(days)).div(100));
  const irCents = IR_EXEMPT.value.includes(instrument) ? 0 : scaleCents(gainCents - iofCents, fixedIncomeIrPct(days).div(100));
  return { iofCents, irCents };
}
