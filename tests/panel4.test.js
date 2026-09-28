/*
 * Prueba determinista del Panel 4 «Tráfico Web» (sin datos falsos).
 *
 * Carga `app.js` en un sandbox de Node con un DOM mínimo y comprueba que:
 *   - `analytics.json` ausente/fallido (null) -> estado vacío.
 *   - fichero válido pero a cero               -> estado vacío.
 *   - objeto vacío `{}`                         -> estado vacío.
 *   - datos reales                              -> badge «En vivo» y KPIs.
 *
 * Uso:  node tests/panel4.test.js
 * Requiere Node (sin dependencias externas).
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function makeSub() { return { textContent: '' }; }
function makeEl() {
  const subs = {};
  return {
    textContent: '',
    dataset: {},
    hidden: true,
    querySelector(sel) { return (subs[sel] ||= makeSub()); },
    addEventListener() {},
    appendChild() {},
  };
}

const ids = [
  'kpi-users-today', 'kpi-sessions', 'kpi-pageviews',
  'analytics-badge', 'chart-analytics', 'chart-analytics-empty', 'analytics-label',
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
const hint = (id) => registry[id].querySelector('[data-hint]').textContent;

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

// 1) analytics.json inexistente/failed -> null
K.renderAnalytics(null);
check('null: KPI usuarios = —', val('kpi-users-today') === '—');
check('null: badge = Esperando datos', registry['analytics-badge'].textContent === 'Esperando datos');
check('null: empty visible', registry['chart-analytics-empty'].hidden === false);
check('null: canvas oculto', registry['chart-analytics'].hidden === true);

// 2) fichero válido pero todo a cero
K.renderAnalytics({ source: 'ga4', usersToday: 0, users7d: 0, sessions7d: 0, pageviews7d: 0, weekly: [{ label: 'Dom', visitors: 0, sessions: 0 }] });
check('ceros: badge = Esperando datos', registry['analytics-badge'].textContent === 'Esperando datos');
check('ceros: hint pide recolección', hint('kpi-users-today').includes('Esperando'));
check('ceros: empty visible', registry['chart-analytics-empty'].hidden === false);
check('ceros: sin datos falsos (KPI = —)', val('kpi-pageviews') === '—');

// 3) datos reales
K.renderAnalytics({ source: 'ga4', usersToday: 1, users7d: 1, sessions7d: 1, pageviews7d: 3, weekly: [{ label: 'Dom', visitors: 1, sessions: 1 }] });
check('real: badge = En vivo', registry['analytics-badge'].textContent === 'En vivo');
check('real: KPI pageviews = 3', val('kpi-pageviews') === '3');
check('real: empty oculto', registry['chart-analytics-empty'].hidden === true);
check('real: canvas visible', registry['chart-analytics'].hidden === false);

// 4) payload inválido
K.renderAnalytics({});
check('vacío {}: badge = Esperando datos', registry['analytics-badge'].textContent === 'Esperando datos');

console.log(failures === 0 ? '\nRESULT: ALL_PASS (13/13)' : `\nRESULT: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
