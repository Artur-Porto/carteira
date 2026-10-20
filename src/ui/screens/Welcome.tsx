import { useState } from 'react';
import { db } from '../../data/instance';
import { startEmpty } from '../../data/settings';
import { loadDemo } from '../../demo/demo';
import { guideHref, hrefFor } from '../routes';
import { RestorePanel } from './RestorePanel';

const goHome = () => window.location.replace(hrefFor('inicio'));

/**
 * First launch, and the screen after everything is erased. Starting from zero opens the short
 * guide (SPEC, "Telas"); the other ways out land on Início.
 */
export function Welcome() {
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function start(withDemo: boolean) {
    setBusy(true);
    try {
      await (withDemo ? loadDemo(db) : startEmpty(db));
      if (withDemo) goHome();
      else window.location.replace(guideHref(0));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen welcome">
      <h1>Carteira</h1>
      <p>Registra a sua carteira, compara com a sua política de investimento e diz para onde vai cada aporte.</p>
      <p className="muted">Os dados ficam só neste aparelho. O app não envia nada seu para a internet.</p>
      <button type="button" className="button primary" disabled={busy} onClick={() => void start(true)}>
        Explorar com dados fictícios
      </button>
      <button type="button" className="button" disabled={busy} onClick={() => void start(false)}>
        Começar do zero
      </button>
      {restoring ? (
        <RestorePanel onRestored={goHome} />
      ) : (
        <button type="button" className="button" disabled={busy} onClick={() => setRestoring(true)}>
          Restaurar um backup
        </button>
      )}
    </main>
  );
}
