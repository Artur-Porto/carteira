import { expect, test } from '@playwright/test';
import { PASSWORD, downloadBackup, dumpDatabase, eraseEverything, openTab, startWithDemo } from './helpers';

test('first launch with demo data reaches every screen', async ({ page }) => {
  await startWithDemo(page);
  await expect(page.getByText('Você está vendo dados fictícios')).toBeVisible();

  await openTab(page, 'Carteira', 'Carteira');
  await expect(page.getByText('Cofrinho do Banco Fictício A')).toBeVisible();
  await openTab(page, 'Aporte', 'Aporte do mês');
  await openTab(page, 'Revisão', 'Revisão mensal');
  await openTab(page, 'Início', 'Início');

  for (const title of ['Reserva', 'Previdência', 'Política', 'Cenários', 'Ferramentas', 'Conversa com o Claude', 'Ajustes']) {
    await openTab(page, 'Mais', 'Mais');
    await page.getByRole('link', { name: new RegExp(`^${title}`) }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.getByRole('link', { name: 'Voltar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mais' })).toBeVisible();
  }
});

test('discreet mode hides every amount and survives a reload', async ({ page }) => {
  await startWithDemo(page);
  await expect(page.locator('.money', { hasText: /\d/ }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Ocultar valores' }).click();
  await expect(page.locator('.money', { hasText: /\d/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Mostrar valores' })).toBeVisible();
  await expect(page.locator('.money', { hasText: /\d/ })).toHaveCount(0);
});

test('a backup restores the device exactly', async ({ page }) => {
  await startWithDemo(page);
  const backup = await downloadBackup(page);
  const before = await dumpDatabase(page);
  expect(before['positions']?.length).toBeGreaterThan(0);

  await eraseEverything(page);
  await page.getByRole('button', { name: 'Restaurar um backup' }).click();
  const panel = page.getByRole('region', { name: 'Restaurar backup' });
  await panel.locator('input[type=file]').setInputFiles(backup);

  await panel.getByLabel('Senha do backup').fill('outra-senha-123');
  await panel.getByRole('button', { name: 'Abrir backup' }).click();
  await expect(panel.getByText('Senha errada.')).toBeVisible();

  await panel.getByLabel('Senha do backup').fill(PASSWORD);
  await panel.getByRole('button', { name: 'Abrir backup' }).click();
  await expect(panel.getByText(/^Backup de /)).toBeVisible();
  await panel.getByRole('button', { name: 'Substituir e restaurar' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  expect(await dumpDatabase(page)).toEqual(before);
});

test('a file that is not a backup is refused with the reason', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Restaurar um backup' }).click();
  const panel = page.getByRole('region', { name: 'Restaurar backup' });
  await panel.locator('input[type=file]').setInputFiles({
    name: 'planilha.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Produto;Valor\r\nCDB;1.000,00\r\n'),
  });
  await panel.getByLabel('Senha do backup').fill(PASSWORD);
  await panel.getByRole('button', { name: 'Abrir backup' }).click();
  await expect(panel.getByText('Este arquivo não é um backup da Carteira.')).toBeVisible();
});

test('starting from zero shows an empty portfolio', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await expect(page.getByText('Nenhum backup salvo ainda.')).toBeVisible();
  await openTab(page, 'Carteira', 'Carteira');
  await expect(page.getByText('Nenhuma posição ainda.')).toBeVisible();
});
