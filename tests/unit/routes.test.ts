import { describe, expect, it } from 'vitest';
import { describe as describeScreen, guideHref, parseScreen, positionHref } from '../../src/ui/routes';

describe('addresses of the screens', () => {
  it('reads every screen and its parameters from the hash', () => {
    expect(parseScreen('')).toEqual({ name: 'inicio' });
    expect(parseScreen('#/carteira')).toEqual({ name: 'carteira' });
    expect(parseScreen('#/reserva/nova')).toEqual({ name: 'novaPosicao', bucket: 'reserva' });
    expect(parseScreen('#/carteira/nova')).toEqual({ name: 'novaPosicao', bucket: 'livre' });
    expect(parseScreen(positionHref('a b'))).toEqual({ name: 'posicao', id: 'a b' });
    expect(parseScreen(positionHref('p1', 'movimento'))).toEqual({ name: 'movimento', positionId: 'p1', transactionId: null });
    expect(parseScreen(positionHref('p1', 'movimento', 't9'))).toEqual({ name: 'movimento', positionId: 'p1', transactionId: 't9' });
    expect(parseScreen('#/posicao/p1/conciliar')).toEqual({ name: 'conciliar', positionId: 'p1' });
    expect(parseScreen('#/previdencia/plano')).toEqual({ name: 'plano', id: null });
    expect(parseScreen('#/previdencia/x/saldo')).toEqual({ name: 'saldoPlano', planId: 'x' });
    expect(parseScreen(guideHref(1))).toEqual({ name: 'roteiro', step: 1 });
  });

  it('falls back to Início on anything else', () => {
    for (const hash of ['#/nada', '#/posicao', '#/roteiro/fim', '#/%E0%A4%A', '#/carteira/nova/x']) {
      expect(parseScreen(hash)).toEqual({ name: 'inicio' });
    }
  });

  it('gives forms a way back to the screen they belong to', () => {
    expect(describeScreen({ name: 'movimento', positionId: 'p1', transactionId: null })).toEqual({
      title: 'Nova movimentação',
      tab: 'carteira',
      parent: '#/posicao/p1',
    });
    expect(describeScreen({ name: 'reserva' }).parent).toBe('#/mais');
    expect(describeScreen({ name: 'carteira' }).parent).toBeNull();
    expect(describeScreen({ name: 'roteiro', step: 2 }).parent).toBe('#/roteiro/reserva');
  });
});
