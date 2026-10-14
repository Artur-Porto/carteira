// SPEC, milestone 1: the installed app opens offline.
import { expect, test } from '@playwright/test';

test('opens offline after the first visit', async ({ page, context, browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'Playwright drives service workers in Chromium.');
  const origin = new URL(baseURL!).origin;
  const outside: string[] = [];
  context.on('request', request => {
    if (!request.url().startsWith(origin)) outside.push(request.url());
  });

  await page.goto('./');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.getByRole('button', { name: 'Explorar com dados fictícios' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  await expect(page.getByText('Você está vendo dados fictícios')).toBeVisible();
  // The service worker itself also stays on the origin.
  expect(outside).toEqual([]);
});
