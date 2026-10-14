// Fictitious data for exploring the app (SPEC: the first launch offers it). Every name,
// amount and date is invented; the ETF tickers are broad index funds used only as examples.
import { writeTables, type CarteiraDb, type Tables } from '../data/db';
import { defaultSettings } from '../data/settings';
import { initialPolicy } from '../domain/policy';
import type { Institution, Lot, Position, Transaction } from '../domain/types';

type PositionDraft = Pick<Position, 'bucket' | 'assetClass' | 'instrumentType' | 'name' | 'liquidity' | 'costBasisCents'> &
  Partial<Position>;

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
    quantity: null,
    ...stamp,
    ...draft,
  });

  const cofrinho = position({
    bucket: 'reserva', assetClass: 'rfPosFixada', instrumentType: 'CDB', name: 'Cofrinho do Banco Fictício A',
    institutionId: bancoA.id, indexer: 'CDI', rate: '100', startDate: '2025-11-03', liquidity: 'diaria', costBasisCents: 3_000_000,
  });
  const selic = position({
    bucket: 'reserva', assetClass: 'rfPosFixada', instrumentType: 'TesouroSelic', name: 'Tesouro Selic 2031',
    institutionId: tesouro.id, indexer: 'SELIC', rate: '0.05', startDate: '2025-08-04', maturityDate: '2031-03-01',
    liquidity: 'diaria', quantity: '1.2', costBasisCents: 2_000_000,
  });
  const tesouroReserva = position({
    bucket: 'reserva', assetClass: 'rfPosFixada', instrumentType: 'TesouroReserva', name: 'Tesouro Reserva',
    institutionId: tesouro.id, indexer: 'SELIC', rate: '0', startDate: '2026-06-01', liquidity: 'diaria', costBasisCents: 1_000_000,
  });
  const cdb = position({
    bucket: 'livre', assetClass: 'rfPosFixada', instrumentType: 'CDB', name: 'CDB Banco Fictício B 110% do CDI',
    institutionId: bancoB.id, indexer: 'CDI', rate: '110', startDate: '2025-06-16', maturityDate: '2028-06-15',
    liquidity: 'vencimento', costBasisCents: 1_500_000,
  });
  const ipcaCurto = position({
    bucket: 'livre', assetClass: 'rfIpcaCurta', instrumentType: 'TesouroIPCA', name: 'Tesouro IPCA+ 2029',
    institutionId: tesouro.id, indexer: 'IPCA', rate: '7.20', startDate: '2025-09-10', maturityDate: '2029-05-15',
    liquidity: 'diaria', quantity: '2.85', costBasisCents: 1_000_000,
  });
  const prefixado = position({
    bucket: 'livre', assetClass: 'rfPrefixada', instrumentType: 'TesouroPrefixado', name: 'Tesouro Prefixado 2029',
    institutionId: tesouro.id, indexer: 'PRE', rate: '12.30', startDate: '2026-02-05', maturityDate: '2029-01-01',
    liquidity: 'diaria', quantity: '6.9', costBasisCents: 500_000,
  });
  const ipcaLongo = position({
    bucket: 'livre', assetClass: 'rfIpcaLonga', instrumentType: 'TesouroIPCA', name: 'Tesouro IPCA+ 2035',
    institutionId: tesouro.id, indexer: 'IPCA', rate: '6.70', startDate: '2025-04-14', maturityDate: '2035-05-15',
    liquidity: 'diaria', quantity: '5.4', costBasisCents: 1_200_000,
  });
  const bova = position({
    bucket: 'livre', assetClass: 'acoesBrasil', instrumentType: 'ETF', name: 'ETF do Ibovespa', institutionId: corretora.id,
    ticker: 'BOVA11', quantity: '60', startDate: '2025-03-10', liquidity: 'bolsa', costBasisCents: 780_000,
  });
  const fiiA = position({
    bucket: 'livre', assetClass: 'fiis', instrumentType: 'FII', name: 'FII Fictício A', institutionId: corretora.id,
    ticker: 'FIIA11', quantity: '30', startDate: '2025-10-06', liquidity: 'bolsa', costBasisCents: 300_000,
  });
  const fiiB = position({
    bucket: 'livre', assetClass: 'fiis', instrumentType: 'FII', name: 'FII Fictício B', institutionId: corretora.id,
    ticker: 'FIIB11', quantity: '20', startDate: '2026-01-12', liquidity: 'bolsa', costBasisCents: 180_000,
  });
  const ivvb = position({
    bucket: 'livre', assetClass: 'exterior', instrumentType: 'ETF', name: 'ETF do S&P 500', institutionId: corretora.id,
    ticker: 'IVVB11', quantity: '25', startDate: '2025-05-12', liquidity: 'bolsa', costBasisCents: 950_000,
  });
  const btc = position({
    bucket: 'livre', assetClass: 'cripto', instrumentType: 'Cripto', name: 'Bitcoin', ticker: 'BTC', quantity: '0.005',
    startDate: '2025-07-07', liquidity: 'bolsa', costBasisCents: 250_000,
  });
  const positions = [cofrinho, selic, tesouroReserva, cdb, ipcaCurto, prefixado, ipcaLongo, bova, fiiA, fiiB, ivvb, btc];

  // One lot per purchase; the cofrinho got three monthly deposits.
  const lot = (positionId: string, date: string, amountCents: number, quantity: string | null): Lot => ({
    id: uid(), positionId, date, amountCents, quantity, ...stamp,
  });
  const lots = [
    lot(cofrinho.id, '2025-11-03', 1_000_000, null),
    lot(cofrinho.id, '2026-02-02', 1_000_000, null),
    lot(cofrinho.id, '2026-05-04', 1_000_000, null),
    ...positions
      .filter(p => p !== cofrinho)
      .map(p => lot(p.id, p.startDate ?? '2026-01-02', p.costBasisCents, p.quantity)),
  ];

  const transaction = (draft: Pick<Transaction, 'date' | 'type' | 'positionId' | 'amountCents'> & Partial<Transaction>): Transaction => ({
    id: uid(), quantity: null, feesCents: 0, note: '', ...stamp, ...draft,
  });
  const transactions = [
    ...lots.map(l => {
      const isAccount = l.positionId === cofrinho.id || l.positionId === tesouroReserva.id;
      return transaction({
        date: l.date,
        type: isAccount ? 'deposit' : 'buy',
        positionId: l.positionId,
        amountCents: l.amountCents,
        quantity: l.quantity,
      });
    }),
    transaction({ date: '2026-09-15', type: 'income', positionId: fiiA.id, amountCents: 2_550, note: 'Rendimento mensal' }),
    transaction({ date: '2026-09-15', type: 'income', positionId: fiiB.id, amountCents: 1_640, note: 'Rendimento mensal' }),
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
    lots,
    transactions,
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
        balances: [{ date: '2026-09-30', ownCents: 3_100_000, companyCents: 3_100_000 }],
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
