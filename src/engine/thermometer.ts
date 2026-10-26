// Rate thermometer (SPEC, "Termômetro de taxas"): today's rate against its own 10-year history,
// published by the data routine as a percentile. At the 75th percentile or above, the class target
// moves up by half of its band; at the 25th or below, down by half. The difference comes out of
// fixed income tied to the CDI, or goes back to it. Pure.
import { bandFor } from '../domain/policy';
import type { AssetClass, Band, IsoDate, Policy } from '../domain/types';
import type { ThermometerFile } from '../market/files';
import { hundredths } from './allocation';

export const TILT_HIGH = 75;
export const TILT_LOW = 25;
export const TILTED_CLASSES = ['rfIpcaLonga', 'rfPrefixada'] as const;
export type TiltedClass = (typeof TILTED_CLASSES)[number];

export interface Tilt {
  assetClass: TiltedClass;
  /** Bond behind the reading, such as "Tesouro IPCA+ 2035", its rate and its percentile. */
  bond: string | null;
  rate: string | null;
  percentile: number | null;
  /** Points added to the target; negative when it moves down, zero when it stays. */
  shiftPct: number;
}

export interface EffectiveTargets {
  targets: Record<AssetClass, number>;
  bands: Record<AssetClass, Band>;
  tilts: Tilt[];
  /** Date of the readings, null without the thermometer file. */
  asOf: IsoDate | null;
  /** False when the policy turned the thermometer off or there is nothing to read. */
  applied: boolean;
}

/**
 * The targets the app works with: the policy's, moved by the thermometer when it is on. "Half of
 * the band" is half the distance from the target to the edge of its band: with both classes moved
 * up, the worst scenario of the target allocation goes to 18,91%, as the SPEC says. Moved targets
 * get their bands again by the 5/25 rule.
 */
export function effectiveTargets(policy: Pick<Policy, 'targets' | 'bands' | 'tiltEnabled'>, file: ThermometerFile | undefined): EffectiveTargets {
  const tilts: Tilt[] = TILTED_CLASSES.map(cls => {
    const series = file?.series[cls];
    const percentile = series?.percentile ?? null;
    const step = Math.round(Number(hundredths(policy.bands[cls].max) - hundredths(policy.targets[cls])) / 2);
    const direction = percentile === null ? 0 : percentile >= TILT_HIGH ? 1 : percentile <= TILT_LOW ? -1 : 0;
    return { assetClass: cls, bond: series?.bond ?? null, rate: series?.rate ?? null, percentile, shiftPct: (direction * step) / 100 };
  });
  const unchanged = { targets: { ...policy.targets }, bands: { ...policy.bands }, tilts: tilts.map(t => ({ ...t, shiftPct: 0 })), asOf: file?.asOf ?? null };
  if (!policy.tiltEnabled || !file) return { ...unchanged, applied: false };

  const targets = { ...policy.targets };
  let fromCdi = 0;
  for (const t of tilts) {
    targets[t.assetClass] = (Math.round(targets[t.assetClass] * 100) + Math.round(t.shiftPct * 100)) / 100;
    fromCdi += Math.round(t.shiftPct * 100);
  }
  const posFixada = Math.round(targets.rfPosFixada * 100) - fromCdi;
  // A policy with too little in the CDI class to give keeps its targets.
  if (posFixada < 0 || TILTED_CLASSES.some(cls => targets[cls] < 0)) return { ...unchanged, applied: false };
  targets.rfPosFixada = posFixada / 100;
  const bands = { ...policy.bands };
  for (const cls of ['rfPosFixada', ...TILTED_CLASSES] as const) if (targets[cls] !== policy.targets[cls]) bands[cls] = bandFor(targets[cls]);
  return { targets, bands, tilts, asOf: file.asOf, applied: true };
}

/** The policy with the thermometer's targets, for the engine. */
export function withEffectiveTargets<P extends Pick<Policy, 'targets' | 'bands' | 'tiltEnabled'>>(policy: P, file: ThermometerFile | undefined): P {
  const e = effectiveTargets(policy, file);
  return { ...policy, targets: e.targets, bands: e.bands };
}
