import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../../data/instance';
import { eraseAll, updateSettings } from '../../data/settings';
import { loadDemo } from '../../demo/demo';
import { formatDate, formatDateTime } from '../format';
import { useMarket, useToday } from '../hooks';
import { SOURCE_LABELS, freshness } from '../marketStatus';
import { syncMarket } from '../marketSync';
import { ensurePersistence, storageStatus, type StorageStatus } from '../storage';
import { BackupPanel } from './BackupPanel';
import { RestorePanel } from './RestorePanel';

const ERASE_WORD = 'APAGAR';

function DemoSection({ demo }: { demo: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="card" aria-labelledby="demo-title">
      <h2 id="demo-title">Dados fictícios</h2>
      {demo ? (
        <p>Você está usando dados fictícios. Para começar com os seus, apague tudo no fim desta tela.</p>
      ) : (
        <p className="muted">Uma carteira inventada, para explorar o app.</p>
      )}
      {!demo &&
        (confirming ? (
          <>
            <p className="notice">Os dados fictícios substituem todos os dados deste aparelho.</p>
            <button type="button" className="button danger" onClick={() => void loadDemo(db)}>
              Substituir pelos dados fictícios
            </button>
            <button type="button" className="button" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="button" onClick={() => setConfirming(true)}>
            Carregar dados fictícios
          </button>
        ))}
    </section>
  );
}

function MarketSection() {
  const m = useMarket();
  const today = useToday();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!m) return null;
  const sources = freshness(m.files, m.market, today);
  const checked = m.rows.find(r => r.name === 'meta')?.fetchedAt;

  async function update() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await syncMarket(true)!;
      setMessage(
        result.failed.length > 0
          ? 'Alguns arquivos não vieram. Tente de novo mais tarde.'
          : result.updated.length > 0
            ? 'Dados de mercado atualizados.'
            : 'Já estavam atualizados.',
      );
    } catch {
      setMessage('Sem conexão com o servidor do app. Tente de novo mais tarde.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="market-title">
      <h2 id="market-title">Dados de mercado</h2>
      {sources.every(s => s.asOf === null) ? (
        <p>Ainda não há dados de mercado neste aparelho.</p>
      ) : (
        <dl className="rows">
          {sources.map(s => (
            <div key={s.source}>
              <dt>{SOURCE_LABELS[s.source]}</dt>
              <dd>
                {s.asOf ? formatDate(s.asOf) : 'sem dados'}
                {s.asOf && s.stale && ' · desatualizado'}
                {s.late && ' · fonte atrasada'}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {checked && <p className="muted small">Conferido em {formatDateTime(checked)}.</p>}
      <p className="muted small">
        Os arquivos trazem o mercado inteiro, não só o que você tem, e vêm do próprio endereço do app. A rotina publica dados
        novos toda noite de dia útil.
      </p>
      <button type="button" className="button" disabled={busy} onClick={() => void update()}>
        {busy ? 'Atualizando…' : 'Atualizar agora'}
      </button>
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
    </section>
  );
}

function StorageSection() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  useEffect(() => void storageStatus().then(setStatus), []);
  if (!status) return null;
  return (
    <section className="card" aria-labelledby="storage-title">
      <h2 id="storage-title">Armazenamento</h2>
      <p>
        {status.persisted
          ? 'Armazenamento persistente concedido: o sistema não apaga estes dados para liberar espaço.'
          : 'O armazenamento persistente ainda não foi concedido.'}
      </p>
      {status.usageBytes !== null && (
        <p className="muted">Em uso: {Math.max(1, Math.round(status.usageBytes / 1024)).toLocaleString('pt-BR')} KB.</p>
      )}
      {!status.persisted && (
        <button
          type="button"
          className="button"
          onClick={() => void ensurePersistence().then(() => storageStatus().then(setStatus))}
        >
          Pedir armazenamento persistente
        </button>
      )}
    </section>
  );
}

function EraseSection() {
  const [word, setWord] = useState('');
  return (
    <section className="card" aria-labelledby="erase-title">
      <h2 id="erase-title">Apagar tudo</h2>
      <p className="muted">Apaga carteira, política, previdência e diário deste aparelho. Os backups salvos não mudam.</p>
      <label className="field">
        Digite {ERASE_WORD} para confirmar
        <input value={word} autoComplete="off" autoCapitalize="characters" onChange={e => setWord(e.target.value)} />
      </label>
      <button type="button" className="button danger" disabled={word.trim().toUpperCase() !== ERASE_WORD} onClick={() => void eraseAll(db)}>
        Apagar tudo
      </button>
    </section>
  );
}

export function Settings() {
  const settings = useLiveQuery(() => db.settings.get('settings'));
  if (!settings) return null;
  return (
    <>
      <BackupPanel settings={settings} />
      <RestorePanel />
      <section className="card" aria-labelledby="discreet-title">
        <h2 id="discreet-title">Modo discreto</h2>
        <p className="muted">Oculta todos os valores. O olho no topo da tela faz o mesmo.</p>
        <button
          type="button"
          className="button"
          onClick={() => void updateSettings(db, { discreetMode: !settings.discreetMode })}
        >
          {settings.discreetMode ? 'Mostrar valores' : 'Ocultar valores'}
        </button>
      </section>
      <DemoSection demo={settings.demoData} />
      <MarketSection />
      <StorageSection />
      <EraseSection />
      <section className="card" aria-labelledby="about-title">
        <h2 id="about-title">Sobre</h2>
        <p className="muted">
          Carteira {__APP_VERSION__}. Nenhum dado seu sai deste aparelho, exceto o backup que você salvar. Código aberto
          em github.com/Artur-Porto/carteira.
        </p>
      </section>
    </>
  );
}
