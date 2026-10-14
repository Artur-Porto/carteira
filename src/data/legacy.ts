/**
 * Until milestone 1 this address served the iPhone probe. Its database and caches are
 * useless now, so the app removes them on launch.
 */
export async function removeProbeLeftovers(): Promise<void> {
  try {
    indexedDB.deleteDatabase('carteira-probe');
    if (!('caches' in globalThis)) return;
    for (const key of await caches.keys()) if (key.startsWith('probe-')) await caches.delete(key);
  } catch {
    // Nothing to clean, or storage unavailable; the app works either way.
  }
}
