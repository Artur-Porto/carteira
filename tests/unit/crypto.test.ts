import { describe, expect, it } from 'vitest';
import { BackupError, decryptBackup, encryptBackup, PBKDF2_ITERATIONS } from '../../src/data/crypto';

const enc = new TextEncoder();
const text = '{"nota":"ação, previdência, conciliação"}';

/** The BackupError reason a promise fails with, or "ok". */
async function outcome(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof BackupError ? e.reason : String(e);
  }
}

describe('.carteira file', () => {
  it('decrypts what it encrypted', async () => {
    const file = await encryptBackup(enc.encode(text), 'senha certa');
    expect(new TextDecoder().decode(await decryptBackup(file, 'senha certa'))).toBe(text);
  });

  it('stores at least 600 thousand PBKDF2 iterations', async () => {
    const file = await encryptBackup(enc.encode(text), 'senha certa');
    expect(new DataView(file.buffer).getUint32(10)).toBeGreaterThanOrEqual(600_000);
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it('tells a wrong password apart from an altered file', async () => {
    const file = await encryptBackup(enc.encode(text), 'senha certa');
    expect(await outcome(decryptBackup(file, 'senha errada'))).toBe('wrong-password');

    const lastByte = file.slice();
    lastByte[lastByte.length - 1]! ^= 0xff;
    expect(await outcome(decryptBackup(lastByte, 'senha certa'))).toBe('corrupted');

    const iv = file.slice();
    iv[35]! ^= 0x01;
    expect(await outcome(decryptBackup(iv, 'senha certa'))).toBe('corrupted');
  });

  it('refuses files that are not backups', async () => {
    expect(await outcome(decryptBackup(enc.encode('Produto;Valor\r\nCDB;1.000,00\r\n'), 'x'))).toBe('not-a-backup');
    expect(await outcome(decryptBackup(new Uint8Array(0), 'x'))).toBe('not-a-backup');
  });

  it('asks for a newer app when the format is newer', async () => {
    const file = await encryptBackup(enc.encode(text), 'senha certa');
    file[8] = 2;
    expect(await outcome(decryptBackup(file, 'senha certa'))).toBe('newer-format');
  });

  it('accepts an accented password typed in another Unicode form', async () => {
    const file = await encryptBackup(enc.encode(text), 'previdência'.normalize('NFC'));
    expect(await outcome(decryptBackup(file, 'previdência'.normalize('NFD')))).toBe('ok');
  });
});
