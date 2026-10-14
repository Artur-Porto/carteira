import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { db } from './data/instance';
import { removeProbeLeftovers } from './data/legacy';
import { ensureSettings } from './data/settings';
import { App } from './ui/App';
import { ensurePersistence } from './ui/storage';
import './ui/styles.css';

registerSW({ immediate: true });
void removeProbeLeftovers();
void ensurePersistence();

const root = createRoot(document.getElementById('root')!);
ensureSettings(db).then(
  () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  () =>
    root.render(
      <p className="fatal">
        Não foi possível abrir o armazenamento deste aparelho. Feche o app e abra de novo; se continuar, confira se há
        espaço livre.
      </p>,
    ),
);
