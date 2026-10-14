/** Asks the browser to keep the app's data under storage pressure (SPEC, privacy rule 3). */
export async function ensurePersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

export interface StorageStatus {
  persisted: boolean;
  usageBytes: number | null;
}

export async function storageStatus(): Promise<StorageStatus> {
  try {
    const [persisted, estimate] = await Promise.all([navigator.storage.persisted(), navigator.storage.estimate()]);
    return { persisted, usageBytes: estimate.usage ?? null };
  } catch {
    return { persisted: false, usageBytes: null };
  }
}
