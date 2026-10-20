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

  for (const title of [
    'Reserva',
    'Previdência',
    'Política',
    'Cenários',
    'Mesa do investidor',
    'Ferramentas',
    'Conversa com o Claude',
    'Ajustes',
  ]) {
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

test('starting from zero goes through the first steps', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Primeiros passos' })).toBeVisible();

  await page.getByLabel('Custo de vida mensal').fill('6.000,00');
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Onde está a sua reserva?' })).toBeVisible();
  await page.getByLabel('Nome').fill('Cofrinho de teste');
  await page.getByLabel('Banco').fill('Banco Fictício C');
  await page.getByLabel('Saldo de hoje').fill('10.000,00');
  await page.getByRole('button', { name: 'Adicionar à reserva' }).click();
  await expect(page.getByText('Cofrinho de teste')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Previdência da empresa' })).toBeVisible();
  await page.getByRole('link', { name: 'Concluir' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  await expect(page.getByText('Nenhum backup salvo ainda.')).toBeVisible();
  // R$ 10.000,00 applied today, for a monthly cost of R$ 6.000,00.
  await expect(page.getByText('1,6 meses')).toBeVisible();

  await openTab(page, 'Carteira', 'Carteira');
  await expect(page.getByText('Cofrinho de teste')).toBeVisible();
});

test('skipping every first step leaves an empty portfolio', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await page.getByRole('button', { name: 'Pular' }).click();
  await page.getByRole('button', { name: 'Pular' }).click();
  await page.getByRole('link', { name: 'Concluir' }).click();
  await expect(page.getByText('O custo de vida mensal ainda não foi informado.')).toBeVisible();
  await openTab(page, 'Carteira', 'Carteira');
  await expect(page.getByText('Nenhuma posição ainda.')).toBeVisible();
});
