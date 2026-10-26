// Initial investment policy (SPEC, "Política de investimento inicial"). Every number here is
// a default the owner can edit on the Política screen.
import { ASSET_CLASSES, type AssetClass, type Band, type Bucket, type Cents, type IsoDateTime, type Policy, type Scenario, type ScenarioClass } from './types';

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  rfPosFixada: 'Renda fixa pós-fixada',
  rfIpcaCurta: 'IPCA+ até 5 anos',
  rfPrefixada: 'Prefixada até 5 anos',
  rfIpcaLonga: 'IPCA+ acima de 5 anos',
  acoesBrasil: 'Ações Brasil',
  fiis: 'FIIs',
  exterior: 'Exterior',
  cripto: 'Cripto',
};

export const BUCKET_LABELS: Record<Bucket, string> = {
  reserva: 'Reserva',
  livre: 'Carteira livre',
};

export const INITIAL_TARGETS: Record<AssetClass, number> = {
  rfPosFixada: 22,
  rfIpcaCurta: 16,
  rfPrefixada: 8,
  rfIpcaLonga: 18,
  acoesBrasil: 12,
  fiis: 8,
  exterior: 13,
  cripto: 3,
};

/**
 * 5/25 rule: the target plus or minus the smaller of 5 points and 25% of the target. The half
 * width is rounded down to a hundredth of a point, so a band never has more than two decimals.
 */
export function bandFor(target: number): Band {
  const t = Math.round(target * 100);
  const half = Math.min(500, Math.floor(t / 4));
  return { min: (t - half) / 100, max: (t + half) / 100 };
}

/** The bands always follow the targets, so a policy is saved with bands recomputed here. */
export function bandsFor(targets: Record<AssetClass, number>): Record<AssetClass, Band> {
  const entries = Object.entries(targets).map(([cls, target]) => [cls, bandFor(target)]);
  return Object.fromEntries(entries) as Record<AssetClass, Band>;
}

/** SPEC, "Carteira livre": the medium term, 2 to 5 years, and the long term. */
export const TERM_OF_CLASS: Record<AssetClass, 'medio' | 'longo'> = {
  rfPosFixada: 'medio',
  rfIpcaCurta: 'medio',
  rfPrefixada: 'medio',
  rfIpcaLonga: 'longo',
  acoesBrasil: 'longo',
  fiis: 'longo',
  exterior: 'longo',
  cripto: 'longo',
};

export const MEDIUM_TERM_CLASSES: readonly AssetClass[] = ASSET_CLASSES.filter(cls => TERM_OF_CLASS[cls] === 'medio');

const shocks = (values: number[]): Record<ScenarioClass, number> => {
  const [rfPosFixada, rfIpcaCurta, rfPrefixada, rfIpcaLonga, acoesBrasil, fiis, exterior, cripto, creditoPrivado] = values as [
    number, number, number, number, number, number, number, number, number,
  ];
  return { rfPosFixada, rfIpcaCurta, rfPrefixada, rfIpcaLonga, acoesBrasil, fiis, exterior, cripto, creditoPrivado };
};

/** SPEC, "Teste de cenários": assumptions inspired by past crises, not forecasts. */
export const INITIAL_SCENARIOS: Scenario[] = [
  { id: 'criseGlobal', name: 'Crise global', shocks: shocks([0, -4, -8, -20, -50, -35, -20, -70, -5]) },
  { id: 'criseLocal', name: 'Crise local', shocks: shocks([0, -4, -8, -20, -45, -30, 12, -30, -4]) },
  { id: 'jurosEmAlta', name: 'Juros e inflação em alta', shocks: shocks([0, -5, -10, -20, -25, -25, 0, -50, -1]) },
  { id: 'apertoGlobal', name: 'Aperto global, real forte', shocks: shocks([0, -2, -5, -10, -15, -10, -35, -75, -2]) },
  { id: 'invernoCripto', name: 'Inverno cripto', shocks: shocks([0, 0, 0, 0, 0, 0, 0, -80, 0]) },
];

/**
 * Addendum 1, section 2.2: no single stock may cost more than the 2% risk budget in a 70% fall,
 * so 2 ÷ 0.70 = 2.86% of the free portfolio. A constant until milestone 7 derives it from the
 * formula and migrates saved policies that still hold the old 5%.
 */
export const SINGLE_STOCK_MAX_PCT = 2.86;

export type PolicyField = 'months' | 'monthlyCost' | 'minCdi' | 'targets' | AssetClass | 'criptoMaxPct' | 'issuerFgcPct' | 'singleFiiMaxPctOfClass' | 'maxDrawdown';

const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
const pctText = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/**
 * What stops a policy from being saved (SPEC, "Validação": targets that do not add up to 100% and
 * changes that break the limits are refused). Empty when the policy is valid.
 */
export function policyErrors(p: Pick<Policy, 'reserve' | 'targets' | 'limits' | 'maxDrawdown'>): Partial<Record<PolicyField, string>> {
  const errors: Partial<Record<PolicyField, string>> = {};
  const { months, monthlyCostCents, minCdiPct } = p.reserve;
  if (!Number.isInteger(months) || months < 0 || months > 60) errors.months = 'Use um número inteiro de meses, de 0 a 60.';
  if (!Number.isSafeInteger(monthlyCostCents) || monthlyCostCents < 0) errors.monthlyCost = 'Informe o custo de vida mensal, como 6.000,00.';
  if (!(minCdiPct >= 1 && minCdiPct <= 200) || !twoDecimals(minCdiPct)) errors.minCdi = 'Use um percentual do CDI de 1% a 200%.';
  for (const cls of ASSET_CLASSES) {
    const target = p.targets[cls];
    if (!(target >= 0 && target <= 100) || !twoDecimals(target)) errors[cls] = 'Use um percentual de 0 a 100, com até duas casas.';
  }
  const sum = ASSET_CLASSES.reduce((total, cls) => total + Math.round(p.targets[cls] * 100), 0);
  if (sum !== 10_000) errors.targets = `Os alvos somam ${pctText(sum / 100)} e precisam somar 100%.`;
  const limits: [PolicyField, number, number][] = [
    ['criptoMaxPct', p.limits.criptoMaxPct, 0],
    ['issuerFgcPct', p.limits.issuerFgcPct, 1],
    ['singleFiiMaxPctOfClass', p.limits.singleFiiMaxPctOfClass, 1],
    ['maxDrawdown', p.maxDrawdown, 1],
  ];
  for (const [field, value, min] of limits) {
    if (!(value >= min && value <= 100) || !twoDecimals(value)) errors[field] = `Use um percentual de ${min} a 100, com até duas casas.`;
  }
  if (!errors.cripto && !errors.criptoMaxPct && p.targets.cripto > p.limits.criptoMaxPct) {
    errors.cripto = `O alvo passa do teto de cripto, de ${pctText(p.limits.criptoMaxPct)} da carteira livre.`;
  }
  return errors;
}

export function initialPolicy(now: IsoDateTime, monthlyCostCents: Cents = 0): Policy {
  return {
    id: 'policy',
    reserve: { months: 12, monthlyCostCents, minCdiPct: 100 },
    targets: { ...INITIAL_TARGETS },
    bands: bandsFor(INITIAL_TARGETS),
    limits: { criptoMaxPct: 5, issuerFgcPct: 80, singleStockMaxPct: SINGLE_STOCK_MAX_PCT, singleFiiMaxPctOfClass: 25 },
    scenarios: structuredClone(INITIAL_SCENARIOS),
    tiltEnabled: true,
    maxDrawdown: 20,
    createdAt: now,
    updatedAt: now,
  };
}
