import { useState } from 'react';
import { openBackup, restoreBackup, type BackupPayload } from '../../data/backup';
import { BackupError, type BackupErrorReason } from '../../data/crypto';
import { db } from '../../data/instance';
import { formatDateTime } from '../format';

const NEWER_APP = 'Este backup veio de uma versão mais nova do app. Feche e abra o app para atualizá-lo e tente de novo.';

const ERRORS: Record<BackupErrorReason, string> = {
  'not-a-backup': 'Este arquivo não é um backup da Carteira.',
  'newer-format': NEWER_APP,
  'newer-schema': NEWER_APP,
  'wrong-password': 'Senha errada.',
  corrupted: 'O arquivo foi alterado ou está danificado. Tente outra cópia do backup.',
  invalid: 'O conteúdo do backup não é válido.',
};

type Status = { kind: 'idle' } | { kind: 'busy' | 'done' | 'error'; text: string };

export function RestorePanel({ onRestored }: { onRestored?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [payload, setPayload] = useState<BackupPayload | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const busy = status.kind === 'busy';

  async function open(chosen: File) {
    setStatus({ kind: 'busy', text: 'Abrindo o backup…' });
    try {
      setPayload(await openBackup(new Uint8Array(await chosen.arrayBuffer()), password));
      setPassword('');
      setStatus({ kind: 'idle' });
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof BackupError ? ERRORS[e.reason] : 'Não foi possível ler o arquivo.' });
    }
  }

  async function restore(chosen: BackupPayload) {
    setStatus({ kind: 'busy', text: 'Restaurando…' });
    try {
      await restoreBackup(db, chosen);
      setPayload(null);
      setFile(null);
      setStatus({ kind: 'done', text: 'Backup restaurado.' });
      onRestored?.();
    } catch {
      setStatus({ kind: 'error', text: 'A restauração falhou, e nada foi alterado.' });
    }
  }

  return (
    <section className="card" aria-labelledby="restore-title">
      <h2 id="restore-title">Restaurar backup</h2>
      {payload ? (
        <>
          <p>
            Backup de {formatDateTime(payload.exportedAt)}, com {payload.tables.positions.length} posições e{' '}
            {payload.tables.transactions.length} movimentações
            {payload.tables.settings[0]?.demoData ? ' de dados fictícios' : ''}.
          </p>
          <p className="notice">Restaurar substitui todos os dados deste aparelho.</p>
          <button type="button" className="button danger" disabled={busy} onClick={() => void restore(payload)}>
            Substituir e restaurar
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => setPayload(null)}>
            Cancelar
          </button>
        </>
      ) : (
        <>
          <label className="button file">
            {file ? `Arquivo: ${file.name}` : 'Escolher arquivo .carteira'}
            <input
              type="file"
              onChange={e => {
                setFile(e.target.files?.[0] ?? null);
                setStatus({ kind: 'idle' });
              }}
            />
          </label>
          <label className="field">
            Senha do backup
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="button primary"
            disabled={!file || !password || busy}
            onClick={() => file && void open(file)}
          >
            Abrir backup
          </button>
        </>
      )}
      {status.kind !== 'idle' && (
        <p role="status" className={status.kind === 'error' ? 'error' : 'muted'}>
          {status.text}
        </p>
      )}
    </section>
  );
}
