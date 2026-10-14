import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, type ReactNode } from 'react';
import { db } from '../data/instance';
import { updateSettings } from '../data/settings';
import { BackIcon, ChecklistIcon, EyeIcon, HomeIcon, MoreIcon, PlusIcon, WalletIcon } from './components/icons';
import { Planned } from './components/Planned';
import { DiscreetContext } from './discreet';
import { MORE_ROUTES, TITLES, hrefFor, useRoute, type Route } from './routes';
import { Home } from './screens/Home';
import { More } from './screens/More';
import { Portfolio } from './screens/Portfolio';
import { Settings } from './screens/Settings';
import { Welcome } from './screens/Welcome';

const TABS = [
  { route: 'inicio', label: 'Início', icon: <HomeIcon /> },
  { route: 'carteira', label: 'Carteira', icon: <WalletIcon /> },
  { route: 'aporte', label: 'Aporte', icon: <PlusIcon /> },
  { route: 'revisao', label: 'Revisão', icon: <ChecklistIcon /> },
  { route: 'mais', label: 'Mais', icon: <MoreIcon /> },
] as const satisfies readonly { route: Route; label: string; icon: ReactNode }[];

function screen(route: Route): ReactNode {
  switch (route) {
    case 'inicio':
      return <Home />;
    case 'carteira':
      return <Portfolio />;
    case 'mais':
      return <More />;
    case 'ajustes':
      return <Settings />;
    case 'aporte':
      return (
        <Planned milestone="3">
          Informe o valor do aporte e veja para onde vai cada parte, com o motivo, a checagem dos limites e a lista do
          que executar na corretora.
        </Planned>
      );
    case 'revisao':
      return <Planned milestone="4">Checklist do mês, diário de decisões e tese de cada ativo de renda variável.</Planned>;
    case 'reserva':
      return <Planned milestone="2">Saldos da reserva, rendimento estimado pelo CDI e conciliação com o saldo do banco.</Planned>;
    case 'previdencia':
      return (
        <Planned milestone="2 e 5">
          Parte própria e da empresa, carência, saldo garantido e simulador da dedução do PGBL.
        </Planned>
      );
    case 'politica':
      return (
        <Planned milestone="3">
          Meta da reserva, alvos e faixas, limites, choques dos cenários, termômetro de taxas e parâmetros fiscais.
        </Planned>
      );
    case 'cenarios':
      return <Planned milestone="4">Perda da carteira em cada cenário, em reais e em percentual, e a classe que mais pesa.</Planned>;
    case 'ferramentas':
      return (
        <Planned milestone="5">
          Comparador de renda fixa líquido de IR, equivalência entre LCI ou LCA e CDB e projeção de patrimônio.
        </Planned>
      );
    case 'claude':
      return (
        <Planned milestone="5">
          Resumo da carteira em percentuais para colar na conversa, perguntas prontas e importação de ajustes de política.
        </Planned>
      );
  }
}

export function App() {
  const settings = useLiveQuery(() => db.settings.get('settings'));
  const route = useRoute();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  if (!settings) return null;
  if (!settings.onboardedAt) return <Welcome />;

  const tab: Route = (MORE_ROUTES as readonly Route[]).includes(route) ? 'mais' : route;
  const hidden = settings.discreetMode;
  return (
    <DiscreetContext.Provider value={hidden}>
      <header className="topbar">
        {tab === 'mais' && route !== 'mais' ? (
          <a className="icon-button" href={hrefFor('mais')} aria-label="Voltar">
            <BackIcon />
          </a>
        ) : (
          <span />
        )}
        <h1>{TITLES[route]}</h1>
        <button
          type="button"
          className="icon-button"
          aria-pressed={hidden}
          aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
          onClick={() => void updateSettings(db, { discreetMode: !hidden })}
        >
          <EyeIcon crossed={hidden} />
        </button>
      </header>
      <main className="screen">{screen(route)}</main>
      <nav className="tabbar" aria-label="Navegação principal">
        {TABS.map(t => (
          <a key={t.route} href={hrefFor(t.route)} aria-current={tab === t.route ? 'page' : undefined}>
            {t.icon}
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </DiscreetContext.Provider>
  );
}
