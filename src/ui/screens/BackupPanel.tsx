import { useState } from 'react';
import { createBackup, markBackupSaved } from '../../data/backup';
import { db } from '../../data/instance';
import type { AppSettings } from '../../domain/types';
import { formatDateTime } from '../format';
import { offerFile } from '../share';

const MIN_PASSWORD_LENGTH = 8;

interface Ready {
  file: File;
  exportedAt: string;
}

/**
 * Two taps on purpose: deriving the key takes a moment, and Safari only opens the share
 * sheet straight from a tap. "Preparar" encrypts; "Salvar" shares the ready file.
 */
export function BackupPanel({ settings }: { settings: AppSettings }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const problem =
    password.length < MIN_PASSWORD_LENGTH
      ? `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
      : password !== repeat
        ? 'As duas senhas não são iguais.'
        : null;

  async function prepare() {
    setBusy(true);
    setMessage(null);
    try {
      const { bytes, exportedAt, fileName } = await createBackup(db, password, __APP_VERSION__);
      setReady({ file: new File([bytes], fileName, { type: 'application/octet-stream' }), exportedAt });
      setPassword('');
      setRepeat('');
    } catch {
      setMessage({ text: 'Não foi possível preparar o backup.', error: true });
    } finally {
      setBusy(false);
    }
  }

  function save(current: Ready) {
    offerFile(current.file).then(
      async outcome => {
        if (outcome === 'cancelled') {
          setMessage({ text: 'Cancelado: nada foi salvo. Toque em Salvar backup para tentar de novo.', error: false });
          return;
        }
        await markBackupSaved(db, current.exportedAt);
        setReady(null);
        setMessage({
          text: outcome === 'saved' ? 'Backup salvo.' : 'Backup baixado. Confira a pasta de downloads.',
          error: false,
        });
      },
      () => setMessage({ text: 'O menu não abriu. Toque em Salvar backup de novo.', error: true }),
    );
  }

  return (
    <section className="card" aria-labelledby="backup-title">
      <h2 id="backup-title">Backup</h2>
      <p>
        {settings.lastBackupAt
          ? `Último backup salvo em ${formatDateTime(settings.lastBackupAt)}.`
          : 'Nenhum backup salvo neste aparelho.'}
      </p>
      {ready ? (
        <>
          <p>Backup pronto: {ready.file.name}</p>
          <button type="button" className="button primary" onClick={() => save(ready)}>
            Salvar backup
          </button>
          <p className="muted">No menu, toque em Salvar em Arquivos e escolha sempre a mesma pasta, como Downloads.</p>
        </>
      ) : (
        <>
          <p className="muted">
            O arquivo sai cifrado com uma senha. Sem ela, ninguém abre o backup, nem você: guarde a senha num lugar
            seguro.
          </p>
          <label className="field">
            Senha do backup
            <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <label className="field">
            Repita a senha
            <input type="password" autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)} />
          </label>
          {password && problem && <p className="error">{problem}</p>}
          <button type="button" className="button primary" disabled={problem !== null || busy} onClick={() => void prepare()}>
            {busy ? 'Preparando…' : 'Preparar backup'}
          </button>
        </>
      )}
      {message && (
        <p role="status" className={message.error ? 'error' : 'muted'}>
          {message.text}
        </p>
      )}
    </section>
  );
}
