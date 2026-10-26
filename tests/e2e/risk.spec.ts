// Milestone 4: scenarios, rebalancing, the monthly review, the diary and the 72-hour wait.
import { expect, test, type Page } from '@playwright/test';
import { openTab, startWithDemo } from './helpers';

const card = (page: Page, name: string) => page.locator('section.card', { has: page.getByRole('heading', { name, exact: true }) });

async function openMore(page: Page, title: string) {
  await openTab(page, 'Mais', 'Mais');
  await page.getByRole('link', { name: new RegExp(`^${title}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test('the target allocation loses what the SPEC table says in each scenario', async ({ page }) => {
  await startWithDemo(page);
  await openMore(page, 'Cenários');
  const target = card(page, 'Alocação-alvo da política');
  for (const [scenario, loss] of [
    ['Crise global', '-18,38%'],
    ['Crise local', '-12,02%'],
    ['Juros e inflação em alta', '-11,7%'],
    ['Aperto global, real forte', '-11,92%'],
    ['Inverno cripto', '-2,4%'],
  ] as const) {
    await expect(target.locator('li', { hasText: scenario })).toContainText(loss);
  }
  await expect(card(page, 'Patrimônio total')).toContainText('A reserva entra sem choque.');
});

test('a class above its band waits for the contributions, and fixed income is never sold', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Começar do zero' }).click();
  await page.getByLabel('Custo de vida mensal').fill('1.000,00');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Pular' }).click();
  await page.getByRole('link', { name: 'Concluir' }).click();
  await openTab(page, 'Carteira', 'Carteira');
  await page.getByRole('link', { name: 'Adicionar posição' }).click();
  await page.getByLabel('Banco emissor').fill('Banco Fictício D');
  await page.getByLabel('Valor aplicado').fill('10.000,00');
  await page.getByRole('button', { name: 'Adicionar posição' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carteira' })).toBeVisible();

  // The thermometer follows the day's rates, so it is turned off for fixed numbers.
  await openMore(page, 'Política');
  await page.getByLabel('Usar o termômetro nos alvos').uncheck();
  await page.getByRole('textbox', { name: /^Aporte mensal previsto/ }).fill('1.000,00');
  await page.getByRole('button', { name: 'Salvar política' }).click();
  await expect(page.getByRole('status')).toHaveText('Política salva.');

  await openTab(page, 'Aporte', 'Aporte do mês');
  const corrections = card(page, 'Classes fora da faixa');
  // 10.000 <= 27% of (10.000 + 1.000n) needs n >= 27,04; IPCA+ longa needs R$ 1.560,70.
  await expect(corrections).toContainText(
    'Renda fixa pós-fixada está acima da faixa, de 17% a 27%. Os aportes sozinhos levariam 28 meses. Renda fixa com vencimento não entra em sugestão de venda',
  );
  await expect(corrections).toContainText('IPCA+ acima de 5 anos está abaixo da faixa, de 13,5% a 22,5%. Com o aporte mensal todo para ela, volta à faixa em 2 meses.');
});

test('the monthly review closes after a note in the diary', async ({ page }) => {
  await startWithDemo(page);
  await openTab(page, 'Revisão', 'Revisão mensal');
  const diary = card(page, 'Diário de decisões');
  await diary.getByLabel('Decisão e motivo').fill('Mantive a política depois da revisão.');
  await diary.getByLabel('O que faria você mudar de ideia').fill('Uma mudança grande na renda.');
  await diary.getByRole('button', { name: 'Anotar no diário' }).click();
  await expect(diary).toContainText('Mantive a política depois da revisão.');
  await expect(diary).toContainText('Mudaria de ideia se: Uma mudança grande na renda.');
  await expect(page.getByText('Anotar a decisão no diário (feito)')).toBeVisible();
  await page.getByRole('button', { name: 'Concluir a revisão do mês' }).click();
  await expect(page.getByText(/^Revisão concluída em/)).toBeVisible();
});

test('a sale outside the plan waits 72 hours, and giving up stays in the diary', async ({ page }) => {
  await startWithDemo(page);
  await openTab(page, 'Carteira', 'Carteira');
  await page.getByRole('link', { name: /ETF do Ibovespa/ }).click();
  await expect(card(page, 'Tese')).toContainText('Núcleo de ações Brasil');
  const sale = card(page, 'Pensando em vender');
  await sale.getByRole('button', { name: 'Quero vender' }).click();
  await sale.getByLabel('Por que vender').fill('Ações acima da faixa.');
  await sale.getByRole('button', { name: 'Anotar e esperar 72 horas' }).click();
  await expect(sale).toContainText('Intenção de vender anotada em');
  await expect(sale).toContainText('A política pede 72 horas de espera');

  await page.getByRole('link', { name: 'Registrar movimentação' }).click();
  await page.getByLabel('Tipo').selectOption('sell');
  await expect(page.getByText('Esta venda não passou pela espera de 72 horas.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await card(page, 'Pensando em vender').getByRole('button', { name: 'Desistir da venda' }).click();
  await expect(card(page, 'Pensando em vender').getByRole('button', { name: 'Quero vender' })).toBeVisible();
  await openTab(page, 'Revisão', 'Revisão mensal');
  await expect(card(page, 'Diário de decisões')).toContainText('Intenção de venda de BOVA11: desistiu da venda.');
});
