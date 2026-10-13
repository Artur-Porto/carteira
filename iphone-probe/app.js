// Milestone 0 iPhone probe. Fictitious data only; no network beyond this origin.
const PASSWORD = 'teste-marco-0';
const PBKDF2_ITERATIONS = 600_000;
const MAGIC = new TextEncoder().encode('CART0'); // probe format, not the final .carteira layout

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

const results = new Map();
const fileResults = new Map();
const $ = id => document.getElementById(id);

function setResult(map, listId, key, status, label, detail = '') {
  map.set(key, { status, label, detail });
  const ul = $(listId);
  ul.replaceChildren(...[...map.values()].map(r => {
    const li = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = `tag ${r.status}`;
    tag.textContent = { ok: 'OK', fail: 'FALHOU', info: 'INFO', manual: 'VERIFICAR' }[r.status];
    li.append(tag, ` ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    return li;
  }));
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
const dec = new TextDecoder();
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
  if (MAGIC.some((b, i) => bytes[i] !== b)) throw new Error('cabeçalho inválido');
  const iterations = new DataView(bytes.buffer, bytes.byteOffset).getUint32(MAGIC.length);
  const o = MAGIC.length + 4;
  const key = await deriveKey(password, bytes.slice(o, o + 16), iterations);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(o + 16, o + 28) }, key, bytes.slice(o + 28));
  return new Uint8Array(pt);
}

// The backup is prepared ahead of time so share() runs inside the tap's user activation.
let prepared = null;
async function prepareBackup() {
  const { bytes, kdfMs } = await encryptBackup(DEMO, PASSWORD);
  const name = `teste-ficticio-${new Date().toISOString().slice(0, 10)}.carteira`;
  prepared = { file: new File([bytes], name, { type: 'application/octet-stream' }), kdfMs };
  return prepared;
}

// ---------- Automatic tests ----------
async function runTests() {
  results.clear();
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
    const bytes = new Uint8Array(await p.file.arrayBuffer());
    const roundtrip = await decryptBackup(bytes, PASSWORD);
    const same = await sha256Hex(roundtrip) === await sha256Hex(enc.encode(JSON.stringify(DEMO)));
    let wrongRejected = false;
    try { await decryptBackup(bytes, 'senha-errada'); } catch { wrongRejected = true; }
    const corrupt = bytes.slice(); corrupt[corrupt.length - 1] ^= 0xff;
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
async function exportShare() {
  const p = prepared ?? await prepareBackup();
  try {
    await navigator.share({ files: [p.file], title: 'Backup fictício' });
    fileReport('export-share', 'manual', 'Exportação pelo Compartilhar', 'menu abriu; confirme se o arquivo foi salvo em Arquivos');
  } catch (e) {
    fileReport('export-share', e.name === 'AbortError' ? 'manual' : 'fail', 'Exportação pelo Compartilhar', `${e.name}: ${e.message}`);
  }
}
async function exportDownload() {
  const p = prepared ?? await prepareBackup();
  const url = URL.createObjectURL(p.file);
  const a = document.createElement('a');
  a.href = url; a.download = p.file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  fileReport('export-download', 'manual', 'Exportação por download', 'confira o que o iPhone mostrou e se o arquivo chegou em Arquivos');
}
async function importBackup(ev) {
  const f = ev.target.files?.[0];
  if (!f) return;
  try {
    const pt = await decryptBackup(new Uint8Array(await f.arrayBuffer()), PASSWORD);
    const same = await sha256Hex(pt) === await sha256Hex(enc.encode(JSON.stringify(DEMO)));
    fileReport('import-backup', same ? 'ok' : 'fail', 'Importação do backup', `${f.size} bytes; conteúdo ${same ? 'idêntico ao exportado' : 'DIFERENTE'}; tipo informado "${f.type || 'vazio'}"`);
  } catch (e) {
    fileReport('import-backup', 'fail', 'Importação do backup', `${e.name}: ${e.message}`);
  }
  ev.target.value = '';
}
async function importSheet(ev) {
  const f = ev.target.files?.[0];
  if (!f) return;
  // The file may be real: only its format and size are reported, never its name or content.
  const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const kind = head[0] === 0x50 && head[1] === 0x4b ? 'zip (xlsx)' : head[0] === 0xd0 && head[1] === 0xcf ? 'OLE (xls)' : 'texto (csv?)';
  fileReport('import-sheet', 'ok', 'Seletor de arquivos lê planilha', `extensão .${ext}; ${kind}; ${(f.size / 1024).toFixed(1)} KB; tipo informado "${f.type || 'vazio'}"`);
  ev.target.value = '';
}

// ---------- Report ----------
function buildReport() {
  const line = r => `[${{ ok: 'OK', fail: 'FALHOU', info: 'INFO', manual: 'VERIFICAR' }[r.status]}] ${r.label}${r.detail ? ' — ' + r.detail : ''}`;
  const launches = [...$('launches').children].map(li => '  ' + li.textContent);
  return ['TESTE-IPHONE marco 0', `Gerado em ${new Date().toISOString()}`, '',
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
$('import-backup').addEventListener('change', importBackup);
$('import-sheet').addEventListener('change', importSheet);
$('copy').addEventListener('click', copyReport);
$('reset').addEventListener('click', resetAll);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: './' });
recordLaunch().catch(e => report('idb', 'fail', 'IndexedDB na abertura', String(e)));
prepareBackup().catch(() => {});
