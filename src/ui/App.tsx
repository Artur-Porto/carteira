import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, type ReactNode } from 'react';
import { db } from '../data/instance';
import { updateSettings } from '../data/settings';
import { BackIcon, ChecklistIcon, EyeIcon, HomeIcon, MoreIcon, PlusIcon, WalletIcon } from './components/icons';
import { Planned } from './components/Planned';
import { DiscreetContext } from './discreet';
import { describe, goBack, hrefFor, useScreen, type Route, type Screen } from './routes';
import { Contribution } from './screens/Contribution';
import { Home } from './screens/Home';
import { More } from './screens/More';
import { MovementForm } from './screens/MovementForm';
import { Onboarding } from './screens/Onboarding';
import { Pension } from './screens/Pension';
import { PensionBalanceForm, PensionPlanForm } from './screens/PensionForms';
import { PolicyScreen } from './screens/PolicyScreen';
import { Portfolio } from './screens/Portfolio';
import { PositionDetail } from './screens/PositionDetail';
import { PositionForm } from './screens/PositionForm';
import { ReconcileForm } from './screens/ReconcileForm';
import { Reserve } from './screens/Reserve';
import { Review } from './screens/Review';
import { Scenarios } from './screens/Scenarios';
import { Settings } from './screens/Settings';
import { Welcome } from './screens/Welcome';

const TABS = [
  { route: 'inicio', label: 'Início', icon: <HomeIcon /> },
  { route: 'carteira', label: 'Carteira', icon: <WalletIcon /> },
  { route: 'aporte', label: 'Aporte', icon: <PlusIcon /> },
  { route: 'revisao', label: 'Revisão', icon: <ChecklistIcon /> },
  { route: 'mais', label: 'Mais', icon: <MoreIcon /> },
] as const satisfies readonly { route: Route; label: string; icon: ReactNode }[];

function render(screen: Screen): ReactNode {
  switch (screen.name) {
    case 'inicio':
      return <Home />;
    case 'carteira':
      return <Portfolio />;
    case 'mais':
      return <More />;
    case 'ajustes':
      return <Settings />;
    case 'reserva':
      return <Reserve />;
    case 'previdencia':
      return <Pension />;
    case 'novaPosicao':
      return <PositionForm key={`nova-${screen.bucket}`} bucket={screen.bucket} />;
    case 'posicao':
      return <PositionDetail id={screen.id} />;
    case 'editarPosicao':
      return <PositionForm key={screen.id} id={screen.id} />;
    case 'movimento':
      return <MovementForm positionId={screen.positionId} transactionId={screen.transactionId} />;
    case 'conciliar':
      return <ReconcileForm positionId={screen.positionId} />;
    case 'plano':
      return <PensionPlanForm id={screen.id} />;
    case 'saldoPlano':
      return <PensionBalanceForm planId={screen.planId} />;
    case 'roteiro':
      return <Onboarding step={screen.step} />;
    case 'aporte':
      return <Contribution />;
    case 'revisao':
      return <Review />;
    case 'politica':
      return <PolicyScreen />;
    case 'cenarios':
      return <Scenarios />;
    case 'mesa':
      return (
        <Planned milestone="7, 8 e 9">
          Lista de observação com gatilhos, nota do ativo, checklist de compra, calculadora de tamanho máximo e modo
          treino, com dinheiro fictício.
        </Planned>
      );
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
  const screen = useScreen();
  const { title, tab, parent } = describe(screen);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  if (!settings) return null;
  if (!settings.onboardedAt) return <Welcome />;

  const hidden = settings.discreetMode;
  return (
    <DiscreetContext.Provider value={hidden}>
      <header className="topbar">
        {parent ? (
          <a
            className="icon-button"
            href={parent}
            aria-label="Voltar"
            onClick={e => {
              e.preventDefault();
              goBack(parent);
            }}
          >
            <BackIcon />
          </a>
        ) : (
          <span />
        )}
        <h1>{title}</h1>
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
      <main className="screen">{render(screen)}</main>
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
