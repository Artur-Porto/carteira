import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useSyncExternalStore } from 'react';
import { db } from '../data/instance';
import { saoPauloDay } from '../domain/dates';
import { buildMarket } from '../domain/market';
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
    const [positions, transactions, reconciliations, pensionPlans, institutions, policy, settings] = await Promise.all([
      db.positions.toArray(),
      db.transactions.toArray(),
      db.reconciliations.toArray(),
      db.pensionPlans.toArray(),
      db.institutions.toArray(),
      db.policies.get('policy'),
      db.settings.get('settings'),
    ]);
    return { positions, transactions, reconciliations, pensionPlans, institutions, policy, settings };
  });
  const market = useMarket();
  const today = useToday();
  return useMemo(() => {
    if (!data || !market) return undefined;
    const value = valuePortfolio({ ...data, market: market.market, today });
    return { ...data, ...market, today, value, institutionName: (id: string | null) => data.institutions.find(i => i.id === id)?.name ?? null };
  }, [data, market, today]);
}
