// Milestone 3: the policy and the contribution of the month, through the screens. Every position
// here is applied today or has no price, so the values do not depend on the day's market data;
// the expected split comes from the Python reference of docs/marco-3.md.
import { expect, test, type Page } from '@playwright/test';
import { openTab, startWithDemo } from './helpers';

const card = (page: Page, name: string) => page.locator('section.card', { has: page.getByRole('heading', { name, exact: true }) });

async function addPosition(page: Page, fill: (page: Page) => Promise<void>) {
  await openTab(page, 'Carteira', 'Carteira');
  await page.getByRole('link', { name: 'Adicionar posição' }).click();
  await fill(page);
  await page.getByRole('button', { name: 'Adicionar posição' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carteira' })).toBeVisible();
}

test('the contribution goes to the reserve and to the largest shortfalls, and becomes a plan', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await page.getByLabel('Custo de vida mensal').fill('1.000,00');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Nome').fill('Cofrinho de teste');
  await page.getByLabel('Banco').fill('Banco Fictício C');
  await page.getByLabel('Saldo de hoje').fill('8.000,00');
  await page.getByRole('button', { name: 'Adicionar à reserva' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('link', { name: 'Concluir' }).click();

  // Free portfolio: R$ 10.000,00 in a CDB and R$ 2.000,00 in a FII without a price.
  await addPosition(page, async p => {
    await p.getByLabel('Banco emissor').fill('Banco Fictício D');
    await p.getByLabel('Valor aplicado').fill('10.000,00');
  });
  await addPosition(page, async p => {
    await p.getByLabel('Tipo').selectOption('FII');
    await p.getByLabel('Código na bolsa').fill('ficta11');
    await p.getByLabel('Quantidade').fill('20');
    await p.getByLabel('Valor pago, sem os custos').fill('2.000,00');
  });

  // The thermometer (milestone 4) follows the day's rates; off, the targets are the policy's.
  await openTab(page, 'Mais', 'Mais');
  await page.getByRole('link', { name: /^Política/ }).click();
  await page.getByLabel('Usar o termômetro nos alvos').uncheck();
  await page.getByRole('button', { name: 'Salvar política' }).click();
  await expect(page.getByRole('status')).toHaveText('Política salva.');

  await openTab(page, 'Aporte', 'Aporte do mês');
  await page.getByLabel('Valor do aporte').fill('2.000,00');
  // The reserve covers 8 of 12 months, between half and the goal: 50%. The other R$ 1.000,00
  // fill IPCA+ above 5 years down to the shortfall of IPCA+ up to 5 years, then both together.
  const plan = card(page, 'Distribuição sugerida');
  await expect(plan.locator('.split-line', { hasText: 'Reserva' })).toContainText('R$ 1.000,00');
  await expect(plan).toContainText('A reserva cobre 8,0 de 12 meses, entre a metade e a meta, e recebe 50% do aporte.');
  await expect(plan.locator('.split-line', { hasText: 'IPCA+ acima de 5 anos' })).toContainText('R$ 630,00');
  await expect(plan).toContainText('Maior déficit: faltam R$ 2.340,00 para o alvo de 18%');
  await expect(plan.locator('.split-line', { hasText: 'IPCA+ até 5 anos' })).toContainText('R$ 370,00');
  await expect(plan.locator('.split-line')).toHaveCount(3);
  await expect(card(page, 'Checagem depois do aporte')).toContainText(
    'Pior cenário: Crise global, com perda de 6,47% da carteira livre, dentro da tolerância de 20%.',
  );

  await page.getByRole('button', { name: 'Ocultar valores' }).click();
  await expect(plan.locator('.money', { hasText: /\d/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar valores' }).click();

  await page.getByRole('button', { name: 'Salvar plano' }).click();
  await expect(page.getByRole('button', { name: 'Plano salvo' })).toBeDisabled();
  const history = card(page, 'Planos');
  await expect(history).toContainText('planejado');
  await expect(history).toContainText('IPCA+ acima de 5 anos: R$ 630,00');
  await history.getByRole('button', { name: 'Marcar como executado' }).click();
  await expect(history).toContainText('executado');
  await expect(history.getByRole('button', { name: 'Marcar como executado' })).toHaveCount(0);
});

test('the policy refuses targets that do not add up to 100% and saves valid ones', async ({ page }) => {
  await startWithDemo(page);
  await openTab(page, 'Mais', 'Mais');
  await page.getByRole('link', { name: /^Política/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Política' })).toBeVisible();

  const fiis = page.getByRole('textbox', { name: /^FIIs Faixa/ });
  await fiis.fill('9');
  await expect(page.getByText('Faixa de 6,75% a 11,25%')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar política' }).click();
  await expect(page.getByText('Os alvos somam 101% e precisam somar 100%.')).toBeVisible();

  await page.getByRole('textbox', { name: /^Exterior Faixa/ }).fill('12');
  await page.getByRole('button', { name: 'Salvar política' }).click();
  await expect(page.getByRole('status')).toHaveText('Política salva.');

  await openTab(page, 'Início', 'Início');
  await expect(card(page, 'Alocação da carteira livre')).toContainText('Alvo 9%, faixa de 6,75% a 11,25%');
});

test('without the monthly cost the contribution asks for it', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await page.getByRole('button', { name: 'Pular' }).click();
  await page.getByRole('button', { name: 'Pular' }).click();
  await page.getByRole('link', { name: 'Concluir' }).click();
  await openTab(page, 'Aporte', 'Aporte do mês');
  await page.getByLabel('Valor do aporte').fill('1.000,00');
  await expect(page.getByText('Informe o custo de vida mensal para o app calcular a parte da reserva.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Distribuição sugerida' })).toHaveCount(0);
});
