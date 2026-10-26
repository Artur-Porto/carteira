import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useSyncExternalStore } from 'react';
import { db } from '../data/instance';
import { saoPauloDay } from '../domain/dates';
import { buildMarket } from '../domain/market';
import { initialPolicy } from '../domain/policy';
import { effectiveTargets } from '../engine/thermometer';
import { valuePortfolio } from '../domain/portfolio';
import type { IsoDate } from '../domain/types';
import { marketFiles } from '../market/load';

function onVisible(callback: () => void) {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
}

/** Today in São Paulo. It is read again when the app comes back to the screen. */
export function useToday(): IsoDate {
  return useSyncExternalStore(onVisible, () => saoPauloDay(new Date()));
}

/** The market data stored on the device, ready for the calculations. */
export function useMarket() {
  const rows = useLiveQuery(() => db.market.toArray());
  return useMemo(() => {
    if (!rows) return undefined;
    const files = marketFiles(rows);
    return { market: buildMarket(files), files, rows };
  }, [rows]);
}

/** Every record behind the portfolio, valued on today's date. */
export function usePortfolio() {
  const data = useLiveQuery(async () => {
    const [positions, transactions, reconciliations, pensionPlans, institutions, policy, settings, decisionLogs, theses, contributionPlans] = await Promise.all([
      db.positions.toArray(),
      db.transactions.toArray(),
      db.reconciliations.toArray(),
      db.pensionPlans.toArray(),
      db.institutions.toArray(),
      db.policies.get('policy'),
      db.settings.get('settings'),
      db.decisionLogs.toArray(),
      db.theses.toArray(),
      db.contributionPlans.toArray(),
    ]);
    return { positions, transactions, reconciliations, pensionPlans, institutions, policy, settings, decisionLogs, theses, contributionPlans };
  });
  const market = useMarket();
  const today = useToday();
  return useMemo(() => {
    if (!data || !market) return undefined;
    const value = valuePortfolio({ ...data, market: market.market, today });
    // The policy as saved, or the initial one, with the thermometer's targets when it is on.
    const saved = data.policy ?? initialPolicy(data.settings?.createdAt ?? new Date().toISOString());
    const thermometer = effectiveTargets(saved, market.files.thermometer);
    const activePolicy = { ...saved, targets: thermometer.targets, bands: thermometer.bands };
    return {
      ...data,
      ...market,
      today,
      value,
      thermometer,
      activePolicy,
      institutionName: (id: string | null) => data.institutions.find(i => i.id === id)?.name ?? null,
    };
  }, [data, market, today]);
}
