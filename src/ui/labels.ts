import type { AssetClass, DecisionType, Indexer, InstrumentType, Liquidity, TaxRegime, TransactionType } from '../domain/types';
import type { ValuationIssue } from '../domain/valuation';
import type { BandStatus } from '../engine/allocation';

/** SPEC, "Aporte do mês", step 5: the kind of asset each class takes, never a specific asset. */
export const CLASS_TYPE_TEXTS: Record<AssetClass, string> = {
  rfPosFixada: 'CDB, LCI ou LCA pós-fixado com FGC, ou Tesouro Selic, com vencimento em 2 a 5 anos.',
  rfIpcaCurta: 'Tesouro IPCA+ ou título de banco atrelado ao IPCA, com vencimento em até 5 anos.',
  rfPrefixada: 'Tesouro Prefixado ou título prefixado de banco, com vencimento em até 5 anos.',
  rfIpcaLonga: 'Tesouro IPCA+ com vencimento acima de 5 anos.',
  acoesBrasil: 'ETF amplo de ações Brasil, o núcleo da classe.',
  fiis: 'Cotas de FIIs, sem que um fundo passe do limite dentro da classe.',
  exterior: 'ETF de índice amplo do exterior, listado na B3.',
  cripto: 'Cripto, dentro do teto da política.',
};

export const DECISION_LABELS: Record<DecisionType, string> = {
  aporte: 'Aporte',
  rebalanceamento: 'Rebalanceamento',
  venda: 'Venda',
  politica: 'Política',
  revisao: 'Revisão do mês',
  outro: 'Outro',
};

export const BAND_STATUS_LABELS: Record<BandStatus, string> = {
  abaixo: 'abaixo da faixa',
  dentro: 'dentro da faixa',
  acima: 'acima da faixa',
};

export const INSTRUMENT_LABELS: Record<InstrumentType, string> = {
  CDB: 'CDB',
  RDB: 'RDB',
  LCI: 'LCI',
  LCA: 'LCA',
  TesouroSelic: 'Tesouro Selic',
  TesouroReserva: 'Tesouro Reserva',
  TesouroPrefixado: 'Tesouro Prefixado',
  TesouroPrefixadoJuros: 'Tesouro Prefixado com Juros Semestrais',
  TesouroIPCA: 'Tesouro IPCA+',
  TesouroIPCAJuros: 'Tesouro IPCA+ com Juros Semestrais',
  TesouroEducaMais: 'Tesouro Educa+',
  TesouroRendaMais: 'Tesouro Renda+',
  TesouroIGPMJuros: 'Tesouro IGP-M+ com Juros Semestrais',
  Acao: 'Ação',
  FII: 'FII',
  ETF: 'ETF',
  BDR: 'BDR',
  Cripto: 'Cripto',
};

export const INDEXER_LABELS: Record<Indexer, string> = {
  CDI: 'CDI',
  SELIC: 'Selic',
  IPCA: 'IPCA',
  PRE: 'Prefixado',
};

export const LIQUIDITY_LABELS: Record<Liquidity, string> = {
  diaria: 'Liquidez diária',
  vencimento: 'Só no vencimento',
  bolsa: 'Negociado na bolsa',
};

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  buy: 'Compra',
  sell: 'Venda',
  deposit: 'Aplicação',
  withdraw: 'Resgate',
  income: 'Rendimento',
  contribution: 'Contribuição',
};

export const TAX_REGIME_LABELS: Record<TaxRegime, string> = {
  indefinido: 'Ainda não escolhido',
  progressivo: 'Progressivo',
  regressivo: 'Regressivo',
};

/** What each valuation issue means for the owner, and what to do about it. */
export const ISSUE_TEXTS: Record<ValuationIssue, string> = {
  'sem-preco': 'Sem preço ou taxa para este ativo: o valor mostrado é o aplicado.',
  'sem-historico': 'O histórico do CDI, da Selic ou do IPCA não chega à data da aplicação: o valor mostrado é o aplicado. Informe o saldo do banco para corrigir.',
  'sem-feriados': 'O calendário de feriados ainda não chegou: os dias úteis contam só os fins de semana.',
  vencida: 'O vencimento já passou. Registre o resgate para a posição sair da carteira.',
  'saida-maior': 'Uma saída foi maior do que o app tinha para esta posição. Confira as movimentações.',
  'sem-quantidade': 'Uma movimentação está sem a quantidade, e ficou de fora da conta.',
};
