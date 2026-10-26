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
const REGULAMENTO_FGC = 'https://www.fgc.org.br/documents/d/asset-library-52554/regulamento-fgc_20260603';
const LEI_8668 = 'https://www.planalto.gov.br/ccivil_03/leis/l8668.htm';
const LEI_9250 = 'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm';

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

/**
 * The FGC guarantee per person, summing every institution of the same conglomerate, and the
 * instruments of the app it covers. Tesouro Direto bonds are not covered.
 */
export const FGC_GUARANTEE: TaxRule<{ perConglomerateCents: Cents; instruments: readonly InstrumentType[] }> = {
  id: 'fgc',
  label: 'FGC: até R$ 250 mil por CPF e por conglomerado financeiro, em CDB, RDB, LCI e LCA; teto de R$ 1 milhão a cada 4 anos',
  value: { perConglomerateCents: 25_000_000, instruments: ['CDB', 'RDB', 'LCI', 'LCA'] },
  verifiedAt: '2026-10-25',
  source: { title: 'Regulamento do FGC, anexo II da Resolução CMN 4.222/2013, art. 2º, versão de 03/06/2026', url: REGULAMENTO_FGC },
};

/** Stocks on the exchange: 15% of the gain, exempt when the month's stock sales stay within R$ 20 mil. */
export const STOCK_GAIN: TaxRule<{ ratePct: string; monthlyExemptSalesCents: Cents }> = {
  id: 'ir-acoes',
  label: 'Ações em bolsa: 15% sobre o ganho; isento se as vendas de ações do mês somarem até R$ 20 mil',
  value: { ratePct: '15', monthlyExemptSalesCents: 2_000_000 },
  verifiedAt: '2026-10-25',
  source: { title: 'Lei 11.033/2004, art. 2º, II, e art. 3º, I (a MP 1.303/2025 perdeu a vigência)', url: LEI_11033 },
};

/** ETFs and BDRs on the exchange: 15% of the gain. The R$ 20 mil exemption covers stocks only. */
export const ETF_BDR_GAIN: TaxRule<{ ratePct: string }> = {
  id: 'ir-etf-bdr',
  label: 'ETFs e BDRs em bolsa: 15% sobre o ganho, sem a isenção das ações',
  value: { ratePct: '15' },
  verifiedAt: '2026-10-25',
  source: { title: 'Lei 11.033/2004, art. 2º, II; a isenção do art. 3º, I, vale só para ações', url: LEI_11033 },
};

export const FII_GAIN: TaxRule<{ ratePct: string }> = {
  id: 'ir-fii',
  label: 'FIIs: 20% sobre o ganho na venda das cotas',
  value: { ratePct: '20' },
  verifiedAt: '2026-10-25',
  source: { title: 'Lei 8.668/1993, art. 18', url: LEI_8668 },
};

/**
 * Crypto: exempt when the month's sales stay within R$ 35 mil, all crypto added together, the
 * conservative reading; above it, the whole gain pays by bracket.
 */
export const CRYPTO_GAIN: TaxRule<{ monthlyExemptSalesCents: Cents; brackets: { upToCents: Cents | null; ratePct: string }[] }> = {
  id: 'ir-cripto',
  label: 'Cripto: isento se as vendas do mês somarem até R$ 35 mil; acima disso, 15% a 22,5% do ganho, por faixa',
  value: {
    monthlyExemptSalesCents: 3_500_000,
    brackets: [
      { upToCents: 500_000_000, ratePct: '15' },
      { upToCents: 1_000_000_000, ratePct: '17.5' },
      { upToCents: 3_000_000_000, ratePct: '20' },
      { upToCents: null, ratePct: '22.5' },
    ],
  },
  verifiedAt: '2026-10-25',
  source: { title: 'Lei 9.250/1995, art. 22, II, e Lei 8.981/1995, art. 21, na redação da Lei 13.259/2016', url: LEI_9250 },
};

export const TAX_RULES = [FIXED_INCOME_IR, IOF_FIXED_INCOME, IR_EXEMPT, IOF_ZERO, FGC_GUARANTEE, STOCK_GAIN, ETF_BDR_GAIN, FII_GAIN, CRYPTO_GAIN] as const;

/** Where a sale's income tax comes from; fixed income has its own table above. */
export const MARKET_GAIN_KINDS = ['acao', 'etf', 'fii', 'cripto'] as const;
export type MarketTaxKind = (typeof MARKET_GAIN_KINDS)[number];

export function marketTaxKind(instrument: InstrumentType): MarketTaxKind | null {
  switch (instrument) {
    case 'Acao':
      return 'acao';
    case 'ETF':
    case 'BDR':
      return 'etf';
    case 'FII':
      return 'fii';
    case 'Cripto':
      return 'cripto';
    default:
      return null;
  }
}

/**
 * Estimated income tax on the month's gain of one kind of asset, given the month's total sales of
 * that kind. Losses pay nothing, and the app does not carry them to later months: an estimate.
 */
export function marketGainTax(kind: MarketTaxKind, gainCents: Cents, monthSalesCents: Cents): Cents {
  if (gainCents <= 0) return 0;
  const at = (pct: string) => scaleCents(gainCents, dec(pct).div(100));
  switch (kind) {
    case 'acao':
      return monthSalesCents <= STOCK_GAIN.value.monthlyExemptSalesCents ? 0 : at(STOCK_GAIN.value.ratePct);
    case 'etf':
      return at(ETF_BDR_GAIN.value.ratePct);
    case 'fii':
      return at(FII_GAIN.value.ratePct);
    case 'cripto': {
      if (monthSalesCents <= CRYPTO_GAIN.value.monthlyExemptSalesCents) return 0;
      let tax = new Dec(0);
      let floor = 0;
      for (const { upToCents, ratePct } of CRYPTO_GAIN.value.brackets) {
        const top = upToCents === null ? gainCents : Math.min(gainCents, upToCents);
        if (top > floor) tax = tax.plus(new Dec(top - floor).mul(dec(ratePct)).div(100));
        if (upToCents === null || gainCents <= upToCents) break;
        floor = upToCents;
      }
      return tax.toDecimalPlaces(0, Dec.ROUND_HALF_UP).toNumber();
    }
  }
}

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
