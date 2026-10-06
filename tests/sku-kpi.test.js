/*
 * Prueba determinista del nuevo KPI «Dinero en vuelo» y de la alerta de
 * desajuste de SKUs (Tienda ↔ ERP) del Kiosko.
 *
 * Carga `app.js` en un sandbox de Node con un DOM mínimo y comprueba:
 *   1. Cálculo de `moneyInFlight` (pedidos del trimestre no cancelados y no
 *      facturados) e ignorando cancelados/facturados/otro trimestre.
 *   2. Rellenado del KPI `kpi-inflight`.
 *   3. `skuMismatchCount` (null / error / 0 / N).
 *   4. Badge de SKUs del Panel 3 (Sin datos / OK / Desajuste).
 *   5. Banner global: aviso amarillo cuando hay desajuste de SKUs.
 *
 * Uso:  node tests/sku-kpi.test.js
 * Requiere Node (sin dependencias externas).
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
    querySelector(sel) { return (subs[sel] ||= { textContent: '' }); },
    addEventListener() {},
    appendChild() {},
  };
}

const ids = [
  'kpi-inflight', 'kpi-revenue-quarter', 'kpi-revenue-month',
  'kpi-orders-quarter', 'kpi-invoices-pending',
  'sku-badge', 'global-alert-banner',
];
const registry = {};
ids.forEach((id) => (registry[id] = makeEl()));

const documentStub = {
  querySelector(sel) { return sel.startsWith('#') ? (registry[sel.slice(1)] || null) : null; },
  getElementById(id) { return registry[id] || null; },
  querySelectorAll() { return []; },
  addEventListener() {},
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
  fetch: async () => { throw new Error('sin red en test'); },
  Chart: ChartStub,
};
sandbox.window.Chart = ChartStub;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const K = sandbox.window.MonliKiosk;
if (!K) { console.error('FALLO: window.MonliKiosk no expuesto'); process.exit(1); }

const val = (id) => registry[id].querySelector('[data-value]').textContent;

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

const now = new Date();
const nowSec = Math.floor(now.getTime() / 1000);
const lastYearSec = Math.floor(new Date(now.getFullYear() - 1, now.getMonth(), 15).getTime() / 1000);

// ---- 1) moneyInFlight --------------------------------------------------------
K.state.invoices = [];
K.state.orders = [
  { id: 1, statut: '0', billed: '0', total_ttc: '10.00', date_commande: nowSec }, // cuenta
  { id: 2, statut: '1', billed: '0', total_ttc: '5.50', date_commande: nowSec },  // cuenta
  { id: 3, statut: '3', billed: '1', total_ttc: '99.00', date_commande: nowSec }, // facturado -> no
  { id: 4, statut: '-1', billed: '0', total_ttc: '7.00', date_commande: nowSec }, // cancelado -> no
  { id: 5, statut: '0', billed: '0', total_ttc: '2.50', date_commande: lastYearSec }, // otro año -> no
];

const metrics = K.computeMetrics();
check('moneyInFlight = 15.50', metrics.moneyInFlight.toFixed(2) === '15.50');
check('inflightCount = 2', metrics.inflightCount === 2);

K.renderFinance(metrics);
check('KPI kpi-inflight = 15,50 €', val('kpi-inflight').replace(/\u00a0/g, ' ') === '15,50 €');

// ---- 2) skuMismatchCount -----------------------------------------------------
check('sku null -> null', K.skuMismatchCount(null) === null);
check('sku con error -> null', K.skuMismatchCount({ error: 'HTTP 500' }) === null);
check('sku 0 -> 0', K.skuMismatchCount({ mismatch_count: 0 }) === 0);
check('sku 3 -> 3', K.skuMismatchCount({ mismatch_count: 3 }) === 3);

// ---- 3) badge de SKUs --------------------------------------------------------
K.state.sku = null;
K.renderSkuBadge();
check('badge sin datos', registry['sku-badge'].textContent === 'Sin datos' && registry['sku-badge'].dataset.state === 'pending');

K.state.sku = { mismatch_count: 0, missing_in_dolibarr: [], missing_in_wordpress: [] };
K.renderSkuBadge();
check('badge OK', registry['sku-badge'].textContent === 'OK' && registry['sku-badge'].dataset.state === 'ok');

K.state.sku = { mismatch_count: 3, missing_in_dolibarr: ['A'], missing_in_wordpress: ['B', 'C'] };
K.renderSkuBadge();
check('badge Desajuste (3)', registry['sku-badge'].textContent === 'Desajuste (3)' && registry['sku-badge'].dataset.state === 'warn');

// ---- 4) banner global con desajuste de SKUs ---------------------------------
// Sistema sano (sin alerta crítica) y sin pedidos pendientes: sólo debe salir
// el aviso de SKUs.
K.state.system = {
  temperature_celsius: 50, cpu: { usage_percent: 10 }, memory: { usage_percent: 40 },
  backup_status: 'OK', bridge_status: 'OK',
};
K.state.orders = [];
K.updateGlobalBanner();
const banner = registry['global-alert-banner'];
check('banner visible con desajuste', banner.classList.contains('hidden') === false);
check('banner menciona Desajuste de SKUs', /Desajuste de SKUs/.test(banner.innerHTML));
check('banner es de aviso (warning)', /--warning/.test(banner.innerHTML));

// Sin desajuste -> sin banner
K.state.sku = { mismatch_count: 0, missing_in_dolibarr: [], missing_in_wordpress: [] };
K.updateGlobalBanner();
check('sin desajuste: banner oculto', banner.classList.contains('hidden') === true);

console.log(failures === 0 ? '\nRESULT: ALL_PASS' : `\nRESULT: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
