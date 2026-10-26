// Aporte do mês (SPEC, "Motor de sugestões"): the reserve's part by its coverage (step 2), and the
// rest for the classes with the largest shortfalls against the target, counting the contribution
// (steps 3 and 4). Pure, in exact integers, so the reference cases match to the centavo.
import { ASSET_CLASSES, type AssetClass, type Cents } from '../domain/types';
import { hundredths } from './allocation';

/** Where the reserve stood before the contribution (SPEC, "Prioridade no aporte"). */
export type ReserveZone = 'abaixoDaMetade' | 'abaixoDaMeta' | 'cheia';

export interface ReservePart {
  goalCents: Cents;
  /** Net of the estimated income tax, as on Início: the reserve is there to be withdrawn. */
  currentCents: Cents;
  zone: ReserveZone;
  /** The part of the contribution that goes to the reserve. */
  amountCents: Cents;
}

/**
 * Below half of the goal, 100% of the contribution goes to the reserve; from half to the full goal,
 * 50%; with the goal met, nothing. A contribution that crosses a threshold follows each rate in
 * turn, so the reserve never passes its goal. The odd centavo of the 50% part goes to the reserve.
 */
export function reservePart(amountCents: Cents, currentCents: Cents, goalCents: Cents): ReservePart {
  const half = Math.ceil(goalCents / 2);
  const zone: ReserveZone = currentCents < half ? 'abaixoDaMetade' : currentCents < goalCents ? 'abaixoDaMeta' : 'cheia';
  const atFullRate = Math.min(amountCents, Math.max(0, half - currentCents));
  const atHalfRate = Math.min(amountCents - atFullRate, 2 * Math.max(0, goalCents - Math.max(currentCents + atFullRate, half)));
  return { goalCents, currentCents, zone, amountCents: atFullRate + Math.ceil(atHalfRate / 2) };
}

const desc = (a: bigint, b: bigint) => (a > b ? -1 : a < b ? 1 : 0);

/**
 * Fills the largest shortfalls first: every class that gets money ends at the same shortfall, the
 * level, and none gets more than its cap. Shortfalls, caps and the total share one integer unit.
 * The amounts come back as exact fractions: numerators over a common denominator.
 */
export function levelFill(shortfalls: readonly bigint[], caps: readonly (bigint | null)[], total: bigint): { nums: bigint[]; den: bigint } {
  if (total <= 0n || shortfalls.length === 0) return { nums: shortfalls.map(() => 0n), den: 1n };
  const clamp = (x: bigint, cap: bigint | null) => (x < 0n ? 0n : cap !== null && x > cap ? cap : x);
  const filled = (level: bigint) => shortfalls.reduce((sum, d, i) => sum + clamp(d - level, caps[i] ?? null), 0n);
  // The levels where a class starts to get money, and where it reaches its cap.
  const capPoints = shortfalls.flatMap((d, i) => (caps[i] == null ? [] : [d - caps[i]!]));
  const points = [...new Set([...shortfalls, ...capPoints])].sort(desc);
  let hi = points[0]!;
  let filledHi = filled(hi);
  for (let j = 1; ; j++) {
    const last = j >= points.length;
    const lo = last ? hi - 1n : points[j]!;
    const filledLo = filled(lo);
    if (last || filledLo >= total) {
      // Between two points the classes getting money stay the same, so the amount grows by their
      // number for each unit the level falls; past the last point it keeps that pace.
      const slope = (filledLo - filledHi) / (hi - lo);
      if (slope === 0n) throw new Error('nenhuma classe pode receber o restante do aporte');
      const levelTimesSlope = hi * slope - (total - filledHi);
      const nums = shortfalls.map((d, i) => clamp(d * slope - levelTimesSlope, caps[i] == null ? null : caps[i]! * slope));
      return { nums, den: slope };
    }
    hi = lo;
    filledHi = filledLo;
  }
}

/** SPEC, step 4: at most three classes per contribution; parcels under R$ 100 join the largest shortfall. */
export const MAX_CLASSES = 3;
export const MIN_PARCEL_CENTS = 10_000;

export interface ClassPart {
  assetClass: AssetClass;
  amountCents: Cents;
  /** Shortfall against the target before the split, with the contribution already in the total. */
  shortfallCents: Cents;
  /** Classes whose parcels under the minimum joined this one. */
  merged: AssetClass[];
}

/**
 * Splits what is left for the free portfolio among the classes with the largest shortfalls, in
 * reais, against the targets applied to the portfolio after the contribution. Ties follow the
 * policy's order of classes. Crypto never passes its cap.
 */
export function splitAmongClasses(
  freeCents: Cents,
  byClass: Record<AssetClass, Cents>,
  targets: Record<AssetClass, number>,
  criptoMaxPct: number,
  /** Classes that get nothing, such as the one that weighs most in a scenario past the tolerance. */
  excluded: readonly AssetClass[] = [],
): ClassPart[] {
  if (freeCents <= 0) return [];
  const after = BigInt(ASSET_CLASSES.reduce((sum, cls) => sum + byClass[cls], 0) + freeCents);
  // In ten-thousandths of a centavo, so targets with two decimals stay exact.
  const shortfallOf = (cls: AssetClass) => after * hundredths(targets[cls]) - 10_000n * BigInt(byClass[cls]);
  const chosen = ASSET_CLASSES.map(cls => ({ cls, shortfall: shortfallOf(cls) }))
    .filter(c => c.shortfall > 0n && !excluded.includes(c.cls))
    .sort((a, b) => desc(a.shortfall, b.shortfall))
    .slice(0, MAX_CLASSES);
  const criptoRoom = after * hundredths(criptoMaxPct) - 10_000n * BigInt(byClass.cripto);
  const caps = chosen.map(c => (c.cls === 'cripto' ? (criptoRoom > 0n ? criptoRoom : 0n) : null));
  const { nums, den } = levelFill(
    chosen.map(c => c.shortfall),
    caps,
    10_000n * BigInt(freeCents),
  );

  // Whole centavos: each part rounded down, and the centavos left go to the largest remainders.
  const unit = den * 10_000n;
  const amounts = nums.map(n => n / unit);
  const left = Number(BigInt(freeCents) - amounts.reduce((a, b) => a + b, 0n));
  const byRemainder = nums.map((_, i) => i).sort((a, b) => desc(nums[a]! % unit, nums[b]! % unit));
  for (const i of byRemainder.slice(0, left)) amounts[i] = amounts[i]! + 1n;

  const merged: AssetClass[] = [];
  for (let i = 1; i < amounts.length; i++) {
    if (amounts[i]! > 0n && amounts[i]! < BigInt(MIN_PARCEL_CENTS)) {
      amounts[0] = amounts[0]! + amounts[i]!;
      amounts[i] = 0n;
      merged.push(chosen[i]!.cls);
    }
  }
  return chosen.flatMap((c, i) =>
    amounts[i]! > 0n
      ? [{ assetClass: c.cls, amountCents: Number(amounts[i]), shortfallCents: Number((c.shortfall + 5_000n) / 10_000n), merged: i === 0 ? merged : [] }]
      : [],
  );
}
