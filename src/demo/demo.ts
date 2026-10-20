// Fictitious data for exploring the app (SPEC: the first launch offers it). Every name, amount
// and date is invented. The ETF tickers are broad index funds used only as examples, so they get
// real prices; the FII tickers have five letters, which B3 never uses, so they never match a real
// fund and show the app's "no price" path.
import { writeTables, type CarteiraDb, type Tables } from '../data/db';
import { defaultSettings } from '../data/settings';
import { initialPolicy } from '../domain/policy';
import type { Institution, Position, Reconciliation, Transaction } from '../domain/types';

type PositionDraft = Pick<Position, 'bucket' | 'assetClass' | 'instrumentType' | 'name' | 'liquidity'> & Partial<Position>;

export function demoTables(now: Date, discreetMode = false): Tables {
  const at = now.toISOString();
  const stamp = { createdAt: at, updatedAt: at };
  const uid = () => crypto.randomUUID();

  const institution = (name: string, conglomerate: string, fgcCovered: boolean): Institution => ({
    id: uid(),
    name,
    conglomerate,
    fgcCovered,
    ...stamp,
  });
  const bancoA = institution('Banco Fictício A', 'Conglomerado Fictício A', true);
  const bancoB = institution('Banco Fictício B', 'Conglomerado Fictício B', true);
  const corretora = institution('Corretora Fictícia', 'Corretora Fictícia', false);
  const tesouro = institution('Tesouro Nacional', 'Tesouro Nacional', false);

  const position = (draft: PositionDraft): Position => ({
    id: uid(),
    institutionId: null,
    indexer: null,
    rate: null,
    startDate: null,
    maturityDate: null,
    ticker: null,
    ...stamp,
    ...draft,
  });

  const cofrinho = position({
    bucket: 'reserva', assetClass: 'rfPosFixada', instrumentType: 'CDB', name: 'Cofrinho do Banco Fictício A',
    institutionId: bancoA.id, indexer: 'CDI', rate: '100', startDate: '2025-11-03', liquidity: 'diaria',
  });
  const selic = position({
    bucket: 'reserva', assetClass: 'rfPosFixada', instrumentType: 'TesouroSelic', name: 'Tesouro Selic 2031',
    institutionId: tesouro.id, indexer: 'SELIC', rate: '0.05', startDate: '2025-08-04', maturityDate: '2031-03-01',
    liquidity: 'diaria',
  });
  const tesouroReserva = position({
    bucket: 'reserva', assetClass: 'rfPosFixada', instrumentType: 'TesouroReserva', name: 'Tesouro Reserva',
    institutionId: tesouro.id, indexer: 'SELIC', rate: '0', startDate: '2026-06-01', liquidity: 'diaria',
  });
  const cdb = position({
    bucket: 'livre', assetClass: 'rfPosFixada', instrumentType: 'CDB', name: 'CDB Banco Fictício B 110% do CDI',
    institutionId: bancoB.id, indexer: 'CDI', rate: '110', startDate: '2025-06-16', maturityDate: '2028-06-15',
    liquidity: 'vencimento',
  });
  const ipcaCurto = position({
    bucket: 'livre', assetClass: 'rfIpcaCurta', instrumentType: 'TesouroIPCA', name: 'Tesouro IPCA+ 2029',
    institutionId: tesouro.id, indexer: 'IPCA', rate: '7.20', startDate: '2025-09-10', maturityDate: '2029-05-15',
    liquidity: 'diaria',
  });
  const prefixado = position({
    bucket: 'livre', assetClass: 'rfPrefixada', instrumentType: 'TesouroPrefixado', name: 'Tesouro Prefixado 2029',
    institutionId: tesouro.id, indexer: 'PRE', rate: '12.30', startDate: '2026-02-05', maturityDate: '2029-01-01',
    liquidity: 'diaria',
  });
  const ipcaLongo = position({
    bucket: 'livre', assetClass: 'rfIpcaLonga', instrumentType: 'TesouroIPCA', name: 'Tesouro IPCA+ 2035',
    institutionId: tesouro.id, indexer: 'IPCA', rate: '6.70', startDate: '2025-04-14', maturityDate: '2035-05-15',
    liquidity: 'diaria',
  });
  const bova = position({
    bucket: 'livre', assetClass: 'acoesBrasil', instrumentType: 'ETF', name: 'ETF do Ibovespa', institutionId: corretora.id,
    ticker: 'BOVA11', startDate: '2025-03-10', liquidity: 'bolsa',
  });
  const fiiA = position({
    bucket: 'livre', assetClass: 'fiis', instrumentType: 'FII', name: 'FII Fictício A', institutionId: corretora.id,
    ticker: 'FICTA11', startDate: '2025-10-06', liquidity: 'bolsa',
  });
  const fiiB = position({
    bucket: 'livre', assetClass: 'fiis', instrumentType: 'FII', name: 'FII Fictício B', institutionId: corretora.id,
    ticker: 'FICTB11', startDate: '2026-01-12', liquidity: 'bolsa',
  });
  const ivvb = position({
    bucket: 'livre', assetClass: 'exterior', instrumentType: 'ETF', name: 'ETF do S&P 500', institutionId: corretora.id,
    ticker: 'IVVB11', startDate: '2025-05-12', liquidity: 'bolsa',
  });
  const btc = position({
    bucket: 'livre', assetClass: 'cripto', instrumentType: 'Cripto', name: 'Bitcoin', ticker: 'BTC',
    startDate: '2025-07-07', liquidity: 'bolsa',
  });
  const positions = [cofrinho, selic, tesouroReserva, cdb, ipcaCurto, prefixado, ipcaLongo, bova, fiiA, fiiB, ivvb, btc];

  const transaction = (
    p: Position,
    draft: Pick<Transaction, 'date' | 'type' | 'amountCents'> & Partial<Transaction>,
  ): Transaction => ({ id: uid(), positionId: p.id, quantity: null, feesCents: 0, note: '', ...stamp, ...draft });
  const transactions = [
    // The cofrinho got four monthly deposits and paid for one emergency.
    transaction(cofrinho, { date: '2025-11-03', type: 'deposit', amountCents: 1_000_000 }),
    transaction(cofrinho, { date: '2026-02-02', type: 'deposit', amountCents: 1_000_000 }),
    transaction(cofrinho, { date: '2026-05-04', type: 'deposit', amountCents: 1_000_000 }),
    transaction(cofrinho, { date: '2026-07-06', type: 'withdraw', amountCents: 300_000, note: 'Conserto do carro' }),
    transaction(cofrinho, { date: '2026-08-03', type: 'deposit', amountCents: 500_000 }),
    transaction(selic, { date: '2025-08-04', type: 'buy', amountCents: 2_000_000, quantity: '1.18' }),
    transaction(tesouroReserva, { date: '2026-06-01', type: 'deposit', amountCents: 1_000_000 }),
    transaction(cdb, { date: '2025-06-16', type: 'deposit', amountCents: 1_500_000 }),
    transaction(ipcaCurto, { date: '2025-09-10', type: 'buy', amountCents: 1_000_000, quantity: '2.85' }),
    transaction(prefixado, { date: '2026-02-05', type: 'buy', amountCents: 500_000, quantity: '6.9' }),
    transaction(ipcaLongo, { date: '2025-04-14', type: 'buy', amountCents: 1_200_000, quantity: '5.4' }),
    transaction(bova, { date: '2025-03-10', type: 'buy', amountCents: 780_000, quantity: '60', feesCents: 490 }),
    transaction(fiiA, { date: '2025-10-06', type: 'buy', amountCents: 300_000, quantity: '30' }),
    transaction(fiiB, { date: '2026-01-12', type: 'buy', amountCents: 180_000, quantity: '20' }),
    transaction(ivvb, { date: '2025-05-12', type: 'buy', amountCents: 950_000, quantity: '25', feesCents: 490 }),
    transaction(btc, { date: '2025-07-07', type: 'buy', amountCents: 250_000, quantity: '0.005' }),
    transaction(fiiA, { date: '2026-09-15', type: 'income', amountCents: 2_550, note: 'Rendimento mensal' }),
    transaction(fiiB, { date: '2026-09-15', type: 'income', amountCents: 1_640, note: 'Rendimento mensal' }),
  ];
  // At the end of September the bank showed R$ 3,41 more than the app's estimate of
  // R$ 34.791,28, which the published CDI of that period gives.
  const reconciliations: Reconciliation[] = [
    { id: uid(), positionId: cofrinho.id, date: '2026-09-30', balanceCents: 3_479_469, ...stamp },
  ];

  const contribution = {
    id: uid(),
    date: '2026-09-05',
    amountCents: 300_000,
    splits: [
      { target: 'reserva' as const, amountCents: 150_000 },
      { target: 'rfIpcaCurta' as const, amountCents: 90_000 },
      { target: 'exterior' as const, amountCents: 60_000 },
    ],
    status: 'done' as const,
    ...stamp,
  };

  return {
    settings: [{ ...defaultSettings(at), discreetMode, demoData: true, onboardedAt: at }],
    policies: [initialPolicy(at, 600_000)],
    institutions: [bancoA, bancoB, corretora, tesouro],
    positions,
    transactions,
    reconciliations,
    pensionPlans: [
      {
        id: uid(),
        name: 'PGBL da Empresa Fictícia',
        startDate: '2023-03-01',
        ownMonthlyCents: 80_000,
        matchPct: 100,
        vestingTable: [
          { years: 2, pct: 20 },
          { years: 4, pct: 40 },
          { years: 6, pct: 60 },
          { years: 8, pct: 80 },
          { years: 10, pct: 100 },
        ],
        balances: [
          { date: '2026-08-31', ownCents: 3_020_000, companyCents: 3_020_000 },
          { date: '2026-09-30', ownCents: 3_100_000, companyCents: 3_100_000 },
        ],
        composition: { rfPosFixada: 60, rfIpcaLonga: 15, acoesBrasil: 10, creditoPrivado: 15 },
        fees: { adminPct: 0.8, loadingPct: 0 },
        taxRegime: 'regressivo',
        ...stamp,
      },
    ],
    contributionPlans: [contribution],
    decisionLogs: [
      {
        id: uid(),
        date: '2026-09-05',
        type: 'aporte',
        reason: 'A reserva estava abaixo da meta, então metade do aporte foi para ela.',
        wouldChangeIf: 'A reserva chegar a 12 meses do custo de vida.',
        relatedIds: [contribution.id],
        ...stamp,
      },
    ],
    theses: [
      {
        id: uid(),
        positionId: bova.id,
        text: 'Núcleo de ações Brasil por um ETF amplo, sem apostar em empresas isoladas.',
        reviewDate: '2027-04-01',
        ...stamp,
      },
    ],
  };
}

/** Replaces everything on the device with the demo set, keeping the discreet mode as it was. */
export async function loadDemo(db: CarteiraDb): Promise<void> {
  const settings = await db.settings.get('settings');
  await writeTables(db, demoTables(new Date(), settings?.discreetMode ?? false));
}
