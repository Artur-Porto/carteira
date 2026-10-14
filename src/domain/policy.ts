// Initial investment policy (SPEC, "Política de investimento inicial"). Every number here is
// a default the owner can edit on the Política screen.
import type { AssetClass, Band, Bucket, Cents, IsoDateTime, Policy, Scenario, ScenarioClass } from './types';

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

/** 5/25 rule: the target plus or minus the smaller of 5 points and 25% of the target. */
export function bandFor(target: number): Band {
  // Hundredths of a point keep the usual targets exact.
  const t = Math.round(target * 100);
  const half = Math.min(500, t / 4);
  return { min: (t - half) / 100, max: (t + half) / 100 };
}

function bandsFor(targets: Record<AssetClass, number>): Record<AssetClass, Band> {
  const entries = Object.entries(targets).map(([cls, target]) => [cls, bandFor(target)]);
  return Object.fromEntries(entries) as Record<AssetClass, Band>;
}

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

export function initialPolicy(now: IsoDateTime, monthlyCostCents: Cents = 0): Policy {
  return {
    id: 'policy',
    reserve: { months: 12, monthlyCostCents, minCdiPct: 100 },
    targets: { ...INITIAL_TARGETS },
    bands: bandsFor(INITIAL_TARGETS),
    limits: { criptoMaxPct: 5, issuerFgcPct: 80, singleStockMaxPct: 5, singleFiiMaxPctOfClass: 25 },
    scenarios: structuredClone(INITIAL_SCENARIOS),
    tiltEnabled: true,
    maxDrawdown: 20,
    createdAt: now,
    updatedAt: now,
  };
}
