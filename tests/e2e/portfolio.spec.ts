// Milestone 2: positions, movements and bank balances, entered through the screens. Every asset
// here is fictitious or applied today, so the values do not depend on the day's market data.
import { expect, test, type Page } from '@playwright/test';
import { openTab } from './helpers';

async function startFromZero(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await page.getByRole('button', { name: 'Pular' }).click();
  await page.getByRole('button', { name: 'Pular' }).click();
  await page.getByRole('link', { name: 'Concluir' }).click();
  await openTab(page, 'Carteira', 'Carteira');
}

/** Today in São Paulo, `years` back or ahead; 29/02 becomes 28/02 so the date always exists. */
function yearsFromToday(years: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return `${Number(today.slice(0, 4)) + years}${today.slice(4)}`.replace(/-02-29$/, '-02-28');
}
const br = (iso: string) => iso.split('-').reverse().join('/');

const card = (page: Page, name: string) => page.locator('section.card', { has: page.getByRole('heading', { name, exact: true }) });

test('a market position keeps its average cost through a sale', async ({ page }) => {
  await startFromZero(page);
  await page.getByRole('link', { name: 'Adicionar posição' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nova posição' })).toBeVisible();
  await page.getByLabel('Tipo').selectOption('FII');
  await page.getByLabel('Código na bolsa').fill('ficta11');
  await expect(page.getByLabel('Classe')).toHaveValue('fiis');
  await page.getByLabel('Quantidade').fill('10');
  await page.getByLabel('Valor pago, sem os custos').fill('1.000,00');
  await page.getByRole('button', { name: 'Adicionar posição' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Carteira' })).toBeVisible();
  await page.getByRole('link', { name: /FICTA11/ }).click();
  await expect(page.getByText('Sem preço ou taxa para este ativo')).toBeVisible();

  await page.getByRole('link', { name: 'Registrar movimentação' }).click();
  await page.getByLabel('Tipo').selectOption('sell');
  await page.getByLabel('Quantidade').fill('4');
  await page.getByLabel('Valor da venda, antes dos custos e do IR').fill('500,00');
  await page.getByRole('button', { name: 'Registrar' }).click();

  // 4 of 10 units leave at the average cost of R$ 100,00: R$ 400,00 of cost, R$ 100,00 of gain.
  const detail = card(page, 'FICTA11');
  await expect(detail.getByRole('definition').filter({ hasText: /^6$/ })).toBeVisible();
  await expect(detail.getByText('R$ 600,00').first()).toBeVisible();
  await expect(detail.getByText('+R$ 100,00')).toBeVisible();

  await page.getByRole('link', { name: /Venda/ }).click();
  await page.getByRole('button', { name: 'Apagar movimentação' }).click();
  await page.getByRole('button', { name: 'Apagar de vez' }).click();
  await expect(card(page, 'FICTA11').getByText('R$ 1.000,00').first()).toBeVisible();

  await page.getByRole('button', { name: 'Excluir posição' }).click();
  await page.getByRole('button', { name: 'Excluir de vez' }).click();
  await expect(page.getByText('Nenhuma posição ainda.')).toBeVisible();
});

test('a bank balance makes the estimate follow the bank', async ({ page }) => {
  await startFromZero(page);
  await page.getByRole('link', { name: 'Adicionar posição' }).click();
  await page.getByLabel('Banco emissor').fill('Banco Fictício D');
  await page.getByLabel('Percentual do CDI').fill('102');
  await page.getByLabel('Balde').selectOption('reserva');
  await page.getByLabel('Valor aplicado').fill('10.000,00');
  await expect(page.getByLabel('Nome')).toHaveValue('CDB Banco Fictício D 102% do CDI');
  await page.getByRole('button', { name: 'Adicionar posição' }).click();

  await page.getByRole('link', { name: /CDB Banco Fictício D/ }).click();
  await page.getByRole('link', { name: 'Informar saldo do banco' }).click();
  await expect(page.getByText('Estimativa do app nessa data: R$ 10.000,00')).toBeVisible();
  await page.getByLabel('Saldo no banco').fill('10.001,00');
  await expect(page.getByText('Diferença: +R$ 1,00')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar saldo' }).click();

  const detail = card(page, 'CDB Banco Fictício D 102% do CDI');
  await expect(detail.locator('.big')).toHaveText('R$ 10.001,00');
  await expect(detail).toContainText('com diferença de +R$ 1,00');

  await openTab(page, 'Mais', 'Mais');
  await page.getByRole('link', { name: /^Reserva/ }).click();
  await expect(card(page, 'Saldo estimado').locator('.big')).toHaveText('R$ 10.001,00');
});

test('the pension plan shows the guaranteed balance and the next vesting step', async ({ page }) => {
  await startFromZero(page);
  await openTab(page, 'Mais', 'Mais');
  await page.getByRole('link', { name: /^Previdência/ }).click();
  await page.getByRole('link', { name: 'Cadastrar plano' }).click();
  await page.getByLabel('Nome do plano').fill('PGBL de teste');
  const start = yearsFromToday(-3);
  await page.getByLabel('Entrada no plano').fill(start);
  await page.getByLabel('Sua contribuição mensal').fill('800,00');
  await page.getByRole('button', { name: 'Adicionar degrau' }).click();
  const years = page.getByLabel('Anos', { exact: true });
  const released = page.getByLabel('% liberado', { exact: true });
  await years.fill('2');
  await released.fill('20');
  await page.getByRole('button', { name: 'Adicionar degrau' }).click();
  await years.nth(1).fill('10');
  await released.nth(1).fill('100');
  await page.getByLabel('Parte própria', { exact: true }).fill('31.000,00');
  await page.getByLabel('Parte da empresa', { exact: true }).fill('31.000,00');
  await page.getByRole('button', { name: 'Cadastrar plano' }).click();

  const plan = card(page, 'PGBL de teste');
  await expect(plan.locator('.big')).toHaveText('R$ 62.000,00');
  // Three years in the plan: the 2-year step released 20% of the company's R$ 31.000,00, and
  // the next step comes on the 10th anniversary.
  await expect(plan.getByText('R$ 37.200,00')).toBeVisible();
  await expect(plan.getByText(br(`${Number(start.slice(0, 4)) + 10}${start.slice(4)}`))).toBeVisible();
});
