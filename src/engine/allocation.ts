// Current allocation of the free portfolio against the policy (SPEC, "Início": "alocação atual
// contra o alvo"; "Rebalanceamento": a class outside its band raises an alert). Pure.
import { Dec } from '../domain/decimal';
import { ASSET_CLASSES, type AssetClass, type Band, type Cents } from '../domain/types';

export type BandStatus = 'abaixo' | 'dentro' | 'acima';

export interface AllocationRow {
  assetClass: AssetClass;
  valueCents: Cents;
  /** Share of the free portfolio, in percent; null while the free portfolio is empty. */
  pct: Dec | null;
  targetPct: number;
  band: Band;
  /** Null while the free portfolio is empty. */
  status: BandStatus | null;
}

/** A percentage with up to two decimals as whole hundredths: 13.5 becomes 1350. */
export const hundredths = (pct: number): bigint => BigInt(Math.round(pct * 100));

/** Where `value` stands within `total` against a band, compared exactly, with the edges inside. */
export function bandStatus(valueCents: Cents, totalCents: Cents, band: Band): BandStatus {
  const share = BigInt(valueCents) * 10_000n;
  if (share < hundredths(band.min) * BigInt(totalCents)) return 'abaixo';
  if (share > hundredths(band.max) * BigInt(totalCents)) return 'acima';
  return 'dentro';
}

/** Each class of the free portfolio with its share, target and band, in the policy's order. */
export function allocation(
  byClass: Record<AssetClass, Cents>,
  targets: Record<AssetClass, number>,
  bands: Record<AssetClass, Band>,
): AllocationRow[] {
  const total = ASSET_CLASSES.reduce((sum, cls) => sum + byClass[cls], 0);
  return ASSET_CLASSES.map(cls => ({
    assetClass: cls,
    valueCents: byClass[cls],
    pct: total > 0 ? new Dec(byClass[cls]).mul(100).div(total) : null,
    targetPct: targets[cls],
    band: bands[cls],
    status: total > 0 ? bandStatus(byClass[cls], total, bands[cls]) : null,
  }));
}
