import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'senha-de-teste-123';

export async function startWithDemo(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Explorar com dados fictícios' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
}

export async function openTab(page: Page, label: string, title: string) {
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: label }).click();
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
}

/** Prepares a backup on the Ajustes screen and returns the downloaded file's path. */
export async function downloadBackup(page: Page): Promise<string> {
  await page.goto('./#/ajustes');
  const panel = page.getByRole('region', { name: 'Backup', exact: true });
  await panel.getByLabel('Senha do backup').fill(PASSWORD);
  await panel.getByLabel('Repita a senha').fill(PASSWORD);
  await panel.getByRole('button', { name: 'Preparar backup' }).click();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Salvar backup' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^carteira-\d{4}-\d{2}-\d{2}\.carteira$/);
  await expect(panel.getByText('Backup baixado')).toBeVisible();
  return file.path();
}

export async function eraseEverything(page: Page) {
  await page.goto('./#/ajustes');
  await page.getByLabel('Digite APAGAR para confirmar').fill('APAGAR');
  await page.getByRole('button', { name: 'Apagar tudo' }).click();
  await expect(page.getByRole('button', { name: 'Explorar com dados fictícios' })).toBeVisible();
}

/**
 * Every object store of the app's IndexedDB that holds the owner's data, read without going
 * through the app. The public market files are left out: they are not part of the backup.
 */
export function dumpDatabase(page: Page): Promise<Record<string, unknown[]>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('carteira');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const out: Record<string, unknown[]> = {};
    for (const name of Array.from(db.objectStoreNames).filter(n => n !== 'market')) {
      out[name] = await new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    db.close();
    return out;
  });
}

/** Waits until the app stored the market files it downloads on launch. */
export async function waitForMarketData(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>(resolve => {
            const req = indexedDB.open('carteira');
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains('market')) return resolve(0);
              const count = db.transaction('market').objectStore('market').count();
              count.onsuccess = () => {
                resolve(count.result);
                db.close();
              };
            };
            req.onerror = () => resolve(0);
          }),
      ),
    )
    .toBeGreaterThan(1);
}
