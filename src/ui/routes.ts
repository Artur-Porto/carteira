import { useSyncExternalStore } from 'react';

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
  'ferramentas',
  'claude',
  'ajustes',
] as const satisfies readonly Route[];

export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '');
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'inicio';
}

export const hrefFor = (route: Route) => (route === 'inicio' ? '#/' : `#/${route}`);

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** Current screen. Routes live in the URL hash, which needs nothing from GitHub Pages. */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parseRoute(window.location.hash));
}
