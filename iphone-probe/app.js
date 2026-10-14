// Milestone 0 iPhone probe. Fictitious data only; no network beyond this origin.
const PAGE = 'v3';
const PASSWORD = 'teste-marco-0';
const PBKDF2_ITERATIONS = 600_000;
const MAGIC = new TextEncoder().encode('CART0'); // probe format, not the final .carteira layout
const BAD_HEADER = 'cabeçalho inválido';

// Deterministic fictitious portfolio, so an imported backup can be checked for identity.
const DEMO = {
  type: 'carteira-probe',
  fictitious: true,
  createdAt: '2026-01-02',
  positions: [
    { id: 'demo-1', assetClass: 'rfPosFixada', instrumentType: 'CDB', institution: 'Banco Fictício A', amountCents: 1234567 },
    { id: 'demo-2', assetClass: 'acoesBrasil', instrumentType: 'ETF', ticker: 'XXXX11', quantity: '37' },
    { id: 'demo-3', assetClass: 'fiis', instrumentType: 'FII', ticker: 'YYYY11', quantity: '12' },
  ],
  note: 'Acentuação de teste: ação, previdência, conciliação, R$ 1.234,56',
};

// Fictitious spreadsheet for the import test, so no real statement is ever needed.
const DEMO_CSV = '﻿' + [
  'Produto;Instituição;Vencimento;Quantidade;Valor',
  'CDB Banco Fictício A;Banco Fictício A;02/01/2028;1;12.345,67',
  'Tesouro IPCA+ 2035;Tesouro Nacional;15/05/2035;0,52;1.234,56',
  'XXXX11;Corretora Fictícia;;37;4.321,00',
].join('\r\n') + '\r\n';

const results = new Map();
const fileResults = new Map();
const $ = id => document.getElementById(id);

const TAGS = { ok: 'OK', fail: 'FALHOU', info: 'INFO', manual: 'VERIFICAR' };
const where = r => r.at ? ` (${fmt(r.at)}, ${r.standalone ? 'tela de início' : 'Safari'}, ${r.online ? 'online' : 'offline'})` : '';

function render(map, listId) {
  $(listId).replaceChildren(...[...map.values()].map(r => {
    const li = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = `tag ${r.status}`;
    tag.textContent = TAGS[r.status];
    li.append(tag, ` ${r.label}${r.detail ? ' — ' + r.detail : ''}${where(r)}`);
    return li;
  }));
}

// Results are saved in IndexedDB per page version: they survive closing the app,
// and results from an older version never mix in.
async function saveResults() {
  const db = await openDb();
  await tx(db, 'kv', 'readwrite', s => s.put({ tests: [...results], files: [...fileResults] }, `results-${PAGE}`));
}
async function loadResults() {
  const db = await openDb();
  const saved = await tx(db, 'kv', 'readonly', s => s.get(`results-${PAGE}`));
  for (const [k, v] of saved?.tests ?? []) results.set(k, v);
  for (const [k, v] of saved?.files ?? []) fileResults.set(k, v);
  render(results, 'results');
  render(fileResults, 'file-results');
}

function setResult(map, listId, key, status, label, detail = '') {
  map.set(key, { status, label, detail, at: new Date().toISOString(), standalone: isStandalone(), online: navigator.onLine });
  render(map, listId);
  saveResults().catch(() => {});
}
const report = (...a) => setResult(results, 'results', ...a);
const fileReport = (...a) => setResult(fileResults, 'file-results', ...a);

// ---------- IndexedDB ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('carteira-probe', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('launches', { autoIncrement: true });
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const fmt = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

async function recordLaunch() {
  const db = await openDb();
  await tx(db, 'launches', 'readwrite', s => s.add({
    at: new Date().toISOString(),
    standalone: isStandalone(),
    online: navigator.onLine,
    swControlled: !!navigator.serviceWorker?.controller,
  }));
  await renderLaunches(db);
}
async function getLaunches(db) {
  return tx(db, 'launches', 'readonly', s => s.getAll());
}
async function renderLaunches(db) {
  const all = await getLaunches(db);
  $('launches').replaceChildren(...all.slice(-12).reverse().map(l => {
    const li = document.createElement('li');
    li.textContent = `${fmt(l.at)} · ${l.standalone ? 'tela de início' : 'Safari'} · ${l.online ? 'online' : 'offline'} · ${l.swControlled ? 'SW ativo' : 'sem SW'}`;
    return li;
  }));
}

// ---------- Crypto ----------
const enc = new TextEncoder();
async function sha256Hex(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptBackup(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const t0 = performance.now();
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const kdfMs = performance.now() - t0;
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  const header = new Uint8Array(MAGIC.length + 4);
  header.set(MAGIC);
  new DataView(header.buffer).setUint32(MAGIC.length, PBKDF2_ITERATIONS);
  const out = new Uint8Array(header.length + 16 + 12 + ct.length);
  out.set(header); out.set(salt, header.length); out.set(iv, header.length + 16); out.set(ct, header.length + 28);
  return { bytes: out, kdfMs };
}
async function decryptBackup(bytes, password) {
  if (MAGIC.some((b, i) => bytes[i] !== b)) throw new Error(BAD_HEADER);
  const iterations = new DataView(bytes.buffer, bytes.byteOffset).getUint32(MAGIC.length);
  const o = MAGIC.length + 4;
  const key = await deriveKey(password, bytes.slice(o, o + 16), iterations);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(o + 16, o + 28) }, key, bytes.slice(o + 28));
  return new Uint8Array(pt);
}
// Layout: magic, iterations (uint32), salt (16), IV (12), then the ciphertext and its 16-byte tag.
const BACKUP_SIZE = MAGIC.length + 4 + 16 + 12 + enc.encode(JSON.stringify(DEMO)).length + 16;

// The backup is prepared ahead of time so share() runs inside the tap's user activation.
let prepared = null;
async function prepareBackup() {
  prepared = await encryptBackup(DEMO, PASSWORD);
  return prepared;
}
// Each export method gets its own file name, so an import can tell where a file came from.
const backupFile = (p, via) => new File([p.bytes], `teste-ficticio-${via}.carteira`, { type: 'application/octet-stream' });
const sheetFile = () => new File([DEMO_CSV], 'planilha-ficticia.csv', { type: 'text/csv' });

// ---------- Automatic tests ----------
async function runTests() {
  report('ua', 'info', 'Aparelho', navigator.userAgent);
  report('secure', isSecureContext ? 'ok' : 'fail', 'Contexto seguro (HTTPS)');
  report('standalone', isStandalone() ? 'ok' : 'manual', 'Aberto pela tela de início', isStandalone() ? '' : 'abra pelo ícone e rode de novo');

  try {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))]);
    const keys = await caches.keys();
    report('sw', navigator.serviceWorker.controller ? 'ok' : 'manual', 'Service worker', `escopo ${new URL(reg.scope).pathname}; caches: ${keys.join(', ') || 'nenhum'}${navigator.serviceWorker.controller ? '' : '; recarregue a página'}`);
  } catch (e) { report('sw', 'fail', 'Service worker', String(e)); }

  try {
    const before = await navigator.storage.persisted();
    const granted = await navigator.storage.persist();
    const after = await navigator.storage.persisted();
    const { quota, usage } = await navigator.storage.estimate();
    report('persist', after ? 'ok' : 'fail', 'Armazenamento persistente', `antes ${before}, pedido ${granted}, depois ${after}; uso ${(usage / 1024).toFixed(0)} KB de ${(quota / 1048576).toFixed(0)} MB`);
  } catch (e) { report('persist', 'fail', 'Armazenamento persistente', String(e)); }

  try {
    const db = await openDb();
    await tx(db, 'kv', 'readwrite', s => s.put(DEMO, 'demo'));
    const back = await tx(db, 'kv', 'readonly', s => s.get('demo'));
    const launches = await getLaunches(db);
    const first = launches[0]?.at;
    report('idb', JSON.stringify(back) === JSON.stringify(DEMO) ? 'ok' : 'fail', 'IndexedDB grava e lê', `${launches.length} aberturas registradas; primeira em ${first ? fmt(first) : '-'}`);
    const offline = launches.filter(l => !l.online && l.standalone);
    report('offline', offline.length ? 'ok' : 'manual', 'Abriu offline pela tela de início', offline.length ? `${offline.length} vez(es)` : 'ainda não: faça o passo do modo avião');
  } catch (e) { report('idb', 'fail', 'IndexedDB', String(e)); }

  try {
    const p = await prepareBackup();
    const roundtrip = await decryptBackup(p.bytes, PASSWORD);
    const same = await sha256Hex(roundtrip) === await sha256Hex(enc.encode(JSON.stringify(DEMO)));
    let wrongRejected = false;
    try { await decryptBackup(p.bytes, 'senha-errada'); } catch { wrongRejected = true; }
    const corrupt = p.bytes.slice(); corrupt[corrupt.length - 1] ^= 0xff;
    let corruptRejected = false;
    try { await decryptBackup(corrupt, PASSWORD); } catch { corruptRejected = true; }
    report('crypto', same && wrongRejected && corruptRejected ? 'ok' : 'fail', 'AES-GCM 256 + PBKDF2-SHA-256',
      `${PBKDF2_ITERATIONS.toLocaleString('pt-BR')} iterações em ${Math.round(p.kdfMs)} ms; ida e volta ${same ? 'idêntica' : 'DIFERENTE'}; senha errada ${wrongRejected ? 'recusada' : 'ACEITA'}; arquivo corrompido ${corruptRejected ? 'recusado' : 'ACEITO'}`);
  } catch (e) { report('crypto', 'fail', 'Cifra', String(e)); }

  try {
    const res = await fetch('data/sample.json', { cache: 'no-store' }).catch(() => fetch('data/sample.json'));
    const j = await res.json();
    report('same-origin', j.fictitious ? 'ok' : 'fail', 'Leitura de /data/*.json da própria origem');
  } catch (e) { report('same-origin', 'fail', 'Leitura da própria origem', String(e)); }

  // CSP must block any third-party request before it leaves the device.
  let violation = null;
  const onViolation = e => { violation = e.violatedDirective || e.effectiveDirective; };
  document.addEventListener('securitypolicyviolation', onViolation);
  let blocked = false;
  try { await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1?formato=json', { mode: 'no-cors' }); }
  catch { blocked = true; }
  await new Promise(r => setTimeout(r, 300));
  document.removeEventListener('securitypolicyviolation', onViolation);
  report('csp', blocked && violation ? 'ok' : 'fail', 'CSP bloqueia rede de terceiros', blocked ? `bloqueado (${violation ?? 'sem evento de violação'})` : 'REQUISIÇÃO PASSOU');

  const probeFile = new File([new Uint8Array([1])], 'x.carteira', { type: 'application/octet-stream' });
  const canShareFiles = !!navigator.canShare && navigator.canShare({ files: [probeFile] });
  report('share', canShareFiles ? 'ok' : 'fail', 'Menu Compartilhar aceita arquivo', canShareFiles ? '' : 'navigator.canShare({files}) = false');
}

// ---------- Export / import ----------
// Any file may be chosen in the pickers, so reports carry only its format and size.
// Names are matched against the probe's own names and never reported.
function originOf(name) {
  const m = /^teste-ficticio-(compartilhar|download)/.exec(name);
  if (m) return m[1];
  return /^teste-ficticio-\d{4}-\d{2}-\d{2}/.test(name) ? 'página v2' : 'outro arquivo';
}
function extLabel(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? `extensão ${name.slice(i).toLowerCase()}` : 'sem extensão';
}
// Coarse format from the first bytes, enough to explain a wrong file without revealing it.
function sniff(head) {
  const s = String.fromCharCode(...head);
  if (!head.length) return 'arquivo vazio';
  if (s.startsWith('CART0')) return 'backup de teste';
  if (s.startsWith('PK')) return 'zip (xlsx, docx)';
  if (head[0] === 0xd0 && head[1] === 0xcf) return 'OLE (xls antigo)';
  if (s.startsWith('%PDF')) return 'PDF';
  if (s.startsWith('bplist')) return 'plist binária (webarchive?)';
  if (head[0] === 0xff && head[1] === 0xd8) return 'imagem JPEG';
  if (s.startsWith('\x89PNG')) return 'imagem PNG';
  if (s.slice(4, 8) === 'ftyp') return 'foto ou vídeo (HEIC, MOV)';
  if (/^(\xef\xbb\xbf)?\s*</.test(s)) return 'HTML ou XML';
  if (/^(blob|data|https?):/.test(s)) return 'texto com um endereço';
  return head.every(b => b >= 32 || b === 9 || b === 10 || b === 13) ? 'texto' : 'binário desconhecido';
}

// share() resolves only after an action is completed in the menu; cancelling rejects with AbortError.
async function shareFile(key, label, file, title) {
  try {
    await navigator.share({ files: [file], title });
    fileReport(key, 'manual', label, 'ação concluída no menu; confirme se o arquivo chegou em Arquivos');
  } catch (e) {
    fileReport(key, e.name === 'AbortError' ? 'manual' : 'fail', label, `${e.name}: ${e.message}`);
  }
}
async function exportShare() {
  const p = prepared ?? await prepareBackup();
  await shareFile('export-share', 'Exportação do backup pelo Compartilhar', backupFile(p, 'compartilhar'), 'Backup fictício');
}
async function exportDownload() {
  const p = prepared ?? await prepareBackup();
  const file = backupFile(p, 'download');
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  fileReport('export-download', 'manual', 'Exportação do backup por download', 'a página não vê o resultado: anote o que o iPhone mostrou e se o arquivo chegou em Arquivos');
}
async function exportSheet() {
  await shareFile('export-sheet', 'Planilha fictícia pelo Compartilhar', sheetFile(), 'Planilha fictícia');
}

async function importBackup(ev) {
  const f = ev.target.files?.[0];
  if (!f) return;
  const via = originOf(f.name);
  const done = (status, detail) => fileReport(`import-backup:${via}`, status, `Importação do backup (${via})`,
    `${f.size} bytes, o exportado tem ${BACKUP_SIZE}; ${extLabel(f.name)}; tipo informado "${f.type || 'vazio'}"; ${detail}`);
  let bytes = new Uint8Array();
  try {
    bytes = new Uint8Array(await f.arrayBuffer());
    const pt = await decryptBackup(bytes, PASSWORD);
    const same = await sha256Hex(pt) === await sha256Hex(enc.encode(JSON.stringify(DEMO)));
    done(same ? 'ok' : 'fail', `conteúdo ${same ? 'idêntico ao exportado' : 'DIFERENTE'}`);
  } catch (e) {
    done('fail', e.message === BAD_HEADER ? `não é o backup: começa como ${sniff(bytes.subarray(0, 16))}`
      : e.name === 'OperationError' ? 'cabeçalho certo, mas a decifra falhou: arquivo alterado ou cortado'
      : `${e.name}: ${e.message}`);
  }
  ev.target.value = '';
}
async function importSheet(ev) {
  const f = ev.target.files?.[0];
  if (!f) return;
  // The probe's own fictitious sheet is also compared byte for byte.
  const fictitious = f.name.startsWith('planilha-ficticia');
  const key = `import-sheet:${fictitious ? 'ficticia' : 'outra'}`;
  const label = `Importação de planilha (${fictitious ? 'fictícia' : 'outra'})`;
  try {
    const head = new Uint8Array(await f.slice(0, 16).arrayBuffer());
    let status = 'ok', check = '';
    if (fictitious) {
      const same = await sha256Hex(await f.arrayBuffer()) === await sha256Hex(await sheetFile().arrayBuffer());
      status = same ? 'ok' : 'fail';
      check = `; ${same ? 'idêntica à gerada' : 'DIFERENTE da gerada'}`;
    }
    fileReport(key, status, label, `${extLabel(f.name)}; ${sniff(head)}; ${(f.size / 1024).toFixed(1)} KB; tipo informado "${f.type || 'vazio'}"${check}`);
  } catch (e) {
    fileReport(key, 'fail', label, `${e.name}: ${e.message}`);
  }
  ev.target.value = '';
}

// ---------- Report ----------
function buildReport() {
  const line = r => `[${TAGS[r.status]}] ${r.label}${r.detail ? ' — ' + r.detail : ''}${where(r)}`;
  const launches = [...$('launches').children].map(li => '  ' + li.textContent);
  return [`TESTE-IPHONE marco 0 (página ${PAGE})`, `Gerado em ${new Date().toISOString()}`, '',
    ...[...results.values()].map(line), ...[...fileResults.values()].map(line), '', 'Aberturas (mais recentes primeiro):', ...launches].join('\n');
}
async function copyReport() {
  const text = buildReport();
  const pre = $('report');
  try { await navigator.clipboard.writeText(text); pre.textContent = 'Copiado.\n\n' + text; }
  catch { pre.textContent = 'Não consegui copiar automaticamente. Selecione o texto abaixo:\n\n' + text; }
  pre.hidden = false;
}
async function resetAll() {
  if (!confirm('Apagar o banco de teste, os caches e o service worker?')) return;
  await new Promise(r => { const q = indexedDB.deleteDatabase('carteira-probe'); q.onsuccess = q.onerror = q.onblocked = r; });
  for (const k of await caches.keys()) await caches.delete(k);
  for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
  location.reload();
}

// ---------- Boot ----------
$('run').addEventListener('click', runTests);
$('export-share').addEventListener('click', exportShare);
$('export-download').addEventListener('click', exportDownload);
$('export-sheet').addEventListener('click', exportSheet);
$('import-backup').addEventListener('change', importBackup);
$('import-sheet').addEventListener('change', importSheet);
$('copy').addEventListener('click', copyReport);
$('reset').addEventListener('click', resetAll);

if ('serviceWorker' in navigator) {
  // When a newer probe takes over on launch, reload once so the page matches its cache.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
  navigator.serviceWorker.register('sw.js', { scope: './' });
}
// Every launch records itself, restores saved results and reruns the automatic tests.
recordLaunch()
  .then(loadResults)
  .catch(e => report('idb', 'fail', 'IndexedDB na abertura', String(e)))
  .finally(runTests);
prepareBackup().catch(() => {});
