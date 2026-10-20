import { useMemo, useSyncExternalStore } from 'react';
import type { Bucket } from '../domain/types';

export const ROUTES = [
  'inicio',
  'carteira',
  'aporte',
  'revisao',
  'mais',
  'reserva',
  'previdencia',
  'politica',
  'cenarios',
  'mesa',
  'ferramentas',
  'claude',
  'ajustes',
] as const;
export type Route = (typeof ROUTES)[number];

export const TITLES: Record<Route, string> = {
  inicio: 'Início',
  carteira: 'Carteira',
  aporte: 'Aporte do mês',
  revisao: 'Revisão mensal',
  mais: 'Mais',
  reserva: 'Reserva',
  previdencia: 'Previdência',
  politica: 'Política',
  cenarios: 'Cenários',
  mesa: 'Mesa do investidor',
  ferramentas: 'Ferramentas',
  claude: 'Conversa com o Claude',
  ajustes: 'Ajustes',
};

/** Screens reached through the "Mais" tab. */
export const MORE_ROUTES = [
  'reserva',
  'previdencia',
  'politica',
  'cenarios',
  'mesa',
  'ferramentas',
  'claude',
  'ajustes',
] as const satisfies readonly Route[];

/** Every screen, with what it takes from the address. */
export type Screen =
  | { name: Route }
  | { name: 'novaPosicao'; bucket: Bucket }
  | { name: 'posicao'; id: string }
  | { name: 'editarPosicao'; id: string }
  | { name: 'movimento'; positionId: string; transactionId: string | null }
  | { name: 'conciliar'; positionId: string }
  | { name: 'plano'; id: string | null }
  | { name: 'saldoPlano'; planId: string }
  | { name: 'roteiro'; step: number };

/** Steps of the first-launch guide, each with its own address so "Voltar" goes one step back. */
export const GUIDE_STEPS = ['', 'reserva', 'previdencia'] as const;
export const guideHref = (step: number) => `#/roteiro${GUIDE_STEPS[step] ? `/${GUIDE_STEPS[step]}` : ''}`;

const isRoute = (name: string | undefined): name is Route => (ROUTES as readonly string[]).includes(name ?? '');

const decode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

export function parseScreen(hash: string): Screen {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decode);
  const [a, b, c, d] = parts;
  if (parts.length === 1 && isRoute(a)) return { name: a };
  if (parts.length === 2 && b === 'nova' && (a === 'carteira' || a === 'reserva')) {
    return { name: 'novaPosicao', bucket: a === 'reserva' ? 'reserva' : 'livre' };
  }
  if (a === 'posicao' && b) {
    if (!c) return { name: 'posicao', id: b };
    if (c === 'editar' && !d) return { name: 'editarPosicao', id: b };
    if (c === 'movimento' && parts.length <= 4) return { name: 'movimento', positionId: b, transactionId: d ?? null };
    if (c === 'conciliar' && !d) return { name: 'conciliar', positionId: b };
  }
  if (a === 'previdencia' && b === 'plano' && parts.length <= 3) return { name: 'plano', id: c ?? null };
  if (a === 'previdencia' && b && c === 'saldo' && !d) return { name: 'saldoPlano', planId: b };
  if (a === 'roteiro' && !c) {
    const step = (GUIDE_STEPS as readonly string[]).indexOf(b ?? '');
    if (step >= 0) return { name: 'roteiro', step };
  }
  return { name: 'inicio' };
}

export const hrefFor = (route: Route) => (route === 'inicio' ? '#/' : `#/${route}`);

export const positionHref = (id: string, ...rest: string[]) => `#/posicao/${[id, ...rest].map(encodeURIComponent).join('/')}`;

/** Title, highlighted tab and parent screen of each screen. */
export function describe(screen: Screen): { title: string; tab: Route; parent: string | null } {
  switch (screen.name) {
    case 'novaPosicao':
      return screen.bucket === 'reserva'
        ? { title: 'Nova posição na reserva', tab: 'mais', parent: hrefFor('reserva') }
        : { title: 'Nova posição', tab: 'carteira', parent: hrefFor('carteira') };
    case 'posicao':
      return { title: 'Posição', tab: 'carteira', parent: hrefFor('carteira') };
    case 'editarPosicao':
      return { title: 'Editar posição', tab: 'carteira', parent: positionHref(screen.id) };
    case 'movimento':
      return { title: screen.transactionId ? 'Editar movimentação' : 'Nova movimentação', tab: 'carteira', parent: positionHref(screen.positionId) };
    case 'conciliar':
      return { title: 'Saldo do banco', tab: 'carteira', parent: positionHref(screen.positionId) };
    case 'plano':
      return { title: screen.id ? 'Editar plano' : 'Novo plano', tab: 'mais', parent: hrefFor('previdencia') };
    case 'saldoPlano':
      return { title: 'Atualizar saldo', tab: 'mais', parent: hrefFor('previdencia') };
    case 'roteiro':
      return { title: 'Primeiros passos', tab: 'inicio', parent: screen.step > 0 ? guideHref(screen.step - 1) : null };
    default: {
      const more = (MORE_ROUTES as readonly Route[]).includes(screen.name);
      return { title: TITLES[screen.name], tab: more ? 'mais' : screen.name, parent: more ? hrefFor('mais') : null };
    }
  }
}

// The app keeps its own stack of visited screens, so "Voltar" returns to where the owner came
// from, as the browser's back button would, and falls back to the parent after a reload.
const visited: string[] = [];

function track() {
  const hash = window.location.hash || '#/';
  if (visited.at(-2) === hash) visited.pop();
  else if (visited.at(-1) !== hash) visited.push(hash);
}

function subscribe(onChange: () => void) {
  const listener = () => {
    track();
    onChange();
  };
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

/** Returns to the previous screen, or to `fallback` when the app started here. */
export function goBack(fallback: string): void {
  if (visited.length > 1) window.history.back();
  else window.location.hash = fallback;
}

/** Current screen. Routes live in the URL hash, which needs nothing from GitHub Pages. */
export function useScreen(): Screen {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  if (visited.length === 0) track();
  return useMemo(() => parseScreen(hash), [hash]);
}
