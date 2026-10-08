/*
 * Prueba de regresión del cableado de `render()` (Kiosko).
 *
 * Contexto: el badge «SKUs Tienda ↔ ERP» mostraba «Sin datos» aunque
 * `sku_status.json` fuese válido, porque `render()` destructuraba el array de
 * `Promise.all` en el orden equivocado:
 *
 *     const [analytics, sku] = await Promise.all([
 *       fetchAnalyticsData(),   // analytics
 *       fetchDolibarrData(),    // <-- se asignaba a `sku` (devuelve undefined)
 *       fetchSystemStatus(),
 *       fetchSkuStatus(),       // <-- se DESCARTABA
 *     ]);
 *
 * Esta prueba ejecuta `render()` de verdad con un DOM permisivo y un `fetch`
 * simulado, y comprueba que `state.sku` recibe el payload de `sku_status.json`
 * y que el badge pasa de «Sin datos» a «Desajuste (N)» / «OK».
 *
 * Uso:  node tests/render-wiring.test.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function makeClassList() {
  return {
    _set: new Set(),
    add(c) { this._set.add(c); },
    remove(c) { this._set.delete(c); },
    toggle(c, on) { if (on) this._set.add(c); else this._set.delete(c); },
    contains(c) { return this._set.has(c); },
  };
}
function makeEl() {
  const subs = {};
  return {
    textContent: '',
    innerHTML: '',
    hidden: true,
    dataset: {},
    classList: makeClassList(),
    querySelector(sel) { return (subs[sel] ||= makeElShallow()); },
    querySelectorAll() { return []; },
    addEventListener() {},
    appendChild() {},
    getContext() { return {}; },
  };
}
function makeElShallow() {
  return { textContent: '', innerHTML: '', dataset: {}, classList: makeClassList() };
}

// DOM permisivo: cualquier selector/id devuelve un elemento memoizado.
const byId = {};
const bySel = {};
const documentStub = {
  getElementById(id) { return (byId[id] ||= makeEl()); },
  querySelector(sel) { return (bySel[sel] ||= makeEl()); },
  querySelectorAll() { return []; },
  addEventListener() {},
};

let skuPayload = {
  generated_at: '2026-10-08T17:00:00+02:00',
  ok: false,
  mismatch_count: 1,
  error: null,
  woocommerce: { products_scanned: 21, skus: 21 },
  dolibarr: { products_scanned: 21, sellable_refs: 21 },
  missing_in_dolibarr: ['PROV-001'],
  missing_in_wordpress: [],
};

const fetchStub = async (url) => {
  const u = String(url);
  let body = [];
  if (u.includes('sku_status.json')) body = skuPayload;
  else if (u.includes('status.json')) body = {};
  else if (u.includes('analytics.json')) body = { usersToday: 0 };
  return { ok: true, status: 200, json: async () => body };
};

function ChartStub() { this.data = {}; }
ChartStub.prototype.destroy = function () {};
ChartStub.prototype.update = function () {};
ChartStub.defaults = { font: {}, color: '' };

const sandbox = {
  console,
  setInterval: () => 0,
  setTimeout: () => 0,
  clearInterval: () => {},
  clearTimeout: () => {},
  Intl, Date, Math, JSON, Number, Array, Object, String, Boolean, RegExp, Error,
  Promise, parseInt, parseFloat, isNaN, isFinite,
  document: documentStub,
  window: {},
  fetch: fetchStub,
  Chart: ChartStub,
};
sandbox.window.Chart = ChartStub;
sandbox.window.MONLI_CONFIG = {};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const K = sandbox.window.MonliKiosk;
if (!K) { console.error('FALLO: window.MonliKiosk no expuesto'); process.exit(1); }

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

(async () => {
  // --- Escenario 1: desajuste de 1 SKU -------------------------------------
  K.state.sku = null;
  await K.render();
  check('render() asigna state.sku desde fetchSkuStatus()', K.state.sku && K.state.sku.mismatch_count === 1);
  check('badge = "Desajuste (1)" (no "Sin datos")', byId['sku-badge'].textContent === 'Desajuste (1)');
  check('badge data-state = warn', byId['sku-badge'].dataset.state === 'warn');

  // --- Escenario 2: todo OK -------------------------------------------------
  skuPayload = {
    generated_at: '2026-10-08T17:00:00+02:00',
    ok: true,
    mismatch_count: 0,
    error: null,
    woocommerce: { products_scanned: 21, skus: 21 },
    dolibarr: { products_scanned: 21, sellable_refs: 21 },
    missing_in_dolibarr: [],
    missing_in_wordpress: [],
  };
  await K.render();
  check('badge = "OK" cuando no hay desajustes', byId['sku-badge'].textContent === 'OK');
  check('badge data-state = ok', byId['sku-badge'].dataset.state === 'ok');

  console.log(failures === 0 ? '\nRESULT: ALL_PASS' : `\nRESULT: ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})();
