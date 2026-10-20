// SPEC, privacy rule 9: the test fails if the app tries any request outside its own origin.
import { expect, test } from '@playwright/test';
import { PASSWORD, downloadBackup, eraseEverything, openTab, startWithDemo, waitForMarketData } from './helpers';

// Routing does not see requests a service worker answers, so this file runs without one.
test.use({ serviceWorkers: 'block' });

test('a full session never leaves the origin', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const outside: string[] = [];
  await context.route(
    url => url.origin !== origin && url.protocol !== 'data:' && url.protocol !== 'blob:',
    route => {
      outside.push(route.request().url());
      return route.abort();
    },
  );
  // Requests the CSP stops never reach the network, so violations are collected too. A blocked
  // style attribute is not a request: WebKit reports one for every <select>, even a plain one
  // with no script around it (docs/marco-2.md). The app's own code never writes style attributes;
  // tests/unit/csp.test.ts checks that.
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => {
      if (e.violatedDirective === 'style-src-attr') return;
      const seen = JSON.parse(sessionStorage.getItem('csp-violations') ?? '[]') as string[];
      sessionStorage.setItem('csp-violations', JSON.stringify([...seen, `${e.violatedDirective} ${e.blockedURI}`]));
    });
  });

  await startWithDemo(page);
  // The market files come from the app's own address.
  await waitForMarketData(page);
  await page.getByRole('button', { name: 'Ocultar valores' }).click();
  await page.getByRole('button', { name: 'Mostrar valores' }).click();
  for (const [label, title] of [
    ['Carteira', 'Carteira'],
    ['Aporte', 'Aporte do mês'],
    ['Revisão', 'Revisão mensal'],
    ['Mais', 'Mais'],
  ] as const) {
    await openTab(page, label, title);
  }
  for (const title of ['Reserva', 'Previdência']) {
    await openTab(page, 'Mais', 'Mais');
    await page.getByRole('link', { name: new RegExp(`^${title}`) }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  }
  await openTab(page, 'Carteira', 'Carteira');
  await page.getByRole('link', { name: /ETF do Ibovespa/ }).click();
  await expect(page.getByRole('heading', { name: 'ETF do Ibovespa' })).toBeVisible();
  await page.getByRole('link', { name: 'Registrar movimentação' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nova movimentação' })).toBeVisible();
  await page.goto('./#/carteira/nova');
  await expect(page.getByRole('heading', { level: 1, name: 'Nova posição' })).toBeVisible();
  await page.goto('./#/ajustes');
  await page.getByRole('button', { name: 'Atualizar agora' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  const backup = await downloadBackup(page);
  await eraseEverything(page);
  await page.getByRole('button', { name: 'Restaurar um backup' }).click();
  const panel = page.getByRole('region', { name: 'Restaurar backup' });
  await panel.locator('input[type=file]').setInputFiles(backup);
  await panel.getByLabel('Senha do backup').fill(PASSWORD);
  await panel.getByRole('button', { name: 'Abrir backup' }).click();
  await panel.getByRole('button', { name: 'Substituir e restaurar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();

  expect(outside).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem('csp-violations'))).toBeNull();
});

test('the CSP stops a request to another site', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/', { mode: 'no-cors' });
      return 'passou';
    } catch {
      return 'bloqueado';
    }
  });
  expect(result).toBe('bloqueado');
});
