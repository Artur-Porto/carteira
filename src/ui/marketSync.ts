import { db } from '../data/instance';
import { refreshMarket, type RefreshResult } from '../market/load';

/** The data routine publishes once a night, so checking more often than this only costs battery. */
const MIN_INTERVAL_MS = 30 * 60_000;

let running: Promise<RefreshResult> | null = null;
let lastAttempt = 0;

/** Downloads what changed in the market files. Without `force`, at most once every 30 minutes. */
export function syncMarket(force = false): Promise<RefreshResult> | null {
  if (running) return running;
  if (!force && Date.now() - lastAttempt < MIN_INTERVAL_MS) return null;
  lastAttempt = Date.now();
  running = refreshMarket(db).finally(() => {
    running = null;
  });
  return running;
}

/**
 * Checks on launch and whenever the app comes back to the screen: an app on the home screen can
 * stay suspended for days without reloading.
 */
export function startMarketSync(): void {
  const attempt = () => void syncMarket()?.catch(() => {});
  attempt();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') attempt();
  });
}
