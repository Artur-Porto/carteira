import type { Indexer, InstrumentType, Liquidity, TaxRegime, TransactionType } from '../domain/types';
import type { ValuationIssue } from '../domain/valuation';

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
