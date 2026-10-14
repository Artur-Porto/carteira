// Encrypted backup file (.carteira), format 1 (SPEC, privacy rule 6).
//
// Layout, in bytes:
//    0  magic "CARTEIRA"
//    8  format version (1)
//    9  key derivation (1 = PBKDF2-HMAC-SHA-256)
//   10  iterations, uint32 big-endian
//   14  salt (16)
//   30  IV (12)
//   42  password check (16)
//   58  AES-256-GCM ciphertext and tag; the 58 header bytes are its additional data
//
// PBKDF2 turns the password into a master key, and HKDF splits that into the AES key and the
// password check. The check tells a wrong password apart from an altered file, and it costs
// a guesser the same full PBKDF2 run as the AES key does.

const MAGIC = new TextEncoder().encode('CARTEIRA');
export const FORMAT_VERSION = 1;
const KDF_PBKDF2_SHA256 = 1;
export const PBKDF2_ITERATIONS = 600_000;
/** Refuses files that would make the device spin for minutes. */
const MAX_ITERATIONS = 10_000_000;
const HEADER_SIZE = 58;
const TAG_SIZE = 16;

export type BackupErrorReason =
  | 'not-a-backup'
  | 'newer-format'
  | 'wrong-password'
  | 'corrupted'
  | 'invalid'
  | 'newer-schema';

export class BackupError extends Error {
  constructor(readonly reason: BackupErrorReason) {
    super(reason);
    this.name = 'BackupError';
  }
}

const enc = new TextEncoder();

async function deriveKeys(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  // NFC, so an accented password typed on another device gives the same bytes.
  const secret = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const master = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, secret, 256);
  const hkdf = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const params = (label: string): HkdfParams => ({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(`carteira/1/${label}`) });
  const key = await crypto.subtle.deriveKey(params('aes'), hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const check = new Uint8Array(await crypto.subtle.deriveBits(params('check'), hkdf, 128));
  return { key, check };
}

export async function encryptBackup(
  plaintext: Uint8Array<ArrayBuffer>,
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<Uint8Array<ArrayBuffer>> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { key, check } = await deriveKeys(password, salt, iterations);
  const header = new Uint8Array(HEADER_SIZE);
  header.set(MAGIC, 0);
  header[8] = FORMAT_VERSION;
  header[9] = KDF_PBKDF2_SHA256;
  new DataView(header.buffer).setUint32(10, iterations);
  header.set(salt, 14);
  header.set(iv, 30);
  header.set(check, 42);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, plaintext);
  const out = new Uint8Array(HEADER_SIZE + ciphertext.byteLength);
  out.set(header);
  out.set(new Uint8Array(ciphertext), HEADER_SIZE);
  return out;
}

export async function decryptBackup(file: Uint8Array<ArrayBuffer>, password: string): Promise<Uint8Array<ArrayBuffer>> {
  if (file.length < HEADER_SIZE + TAG_SIZE || MAGIC.some((b, i) => file[i] !== b)) throw new BackupError('not-a-backup');
  const version = file[8] ?? 0;
  if (version > FORMAT_VERSION) throw new BackupError('newer-format');
  if (version !== FORMAT_VERSION || file[9] !== KDF_PBKDF2_SHA256) throw new BackupError('not-a-backup');
  const iterations = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(10);
  if (iterations < PBKDF2_ITERATIONS || iterations > MAX_ITERATIONS) throw new BackupError('corrupted');

  const header = file.slice(0, HEADER_SIZE);
  const { key, check } = await deriveKeys(password, file.slice(14, 30), iterations);
  if (check.some((b, i) => file[42 + i] !== b)) throw new BackupError('wrong-password');
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: file.slice(30, 42), additionalData: header }, key, file.slice(HEADER_SIZE));
    return new Uint8Array(plaintext);
  } catch {
    throw new BackupError('corrupted');
  }
}
