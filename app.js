/* ==========================================================================
   Monli Kiosk — Lógica de la aplicación
   Integración con la API REST de Dolibarr, gráficos Chart.js, integración de
   status.json y carrusel automático de 4 paneles (finanzas, pedidos,
   infraestructura y tráfico web). Incluye banner global de alertas.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   Configuración
   -------------------------------------------------------------------------- */
const CONFIG = window.MONLI_CONFIG || {};

const STATUS_URL = './status.json';
const SKU_STATUS_URL = './sku_status.json'; // auditoría SKUs Tienda ↔ ERP
const REFRESH_MS = 60_000;        // refresco de datos cada 60 s
const CAROUSEL_INTERVAL_MS = 15_000; // cambio de panel cada 15 s
const ORDERS_LIMIT = 100;
const INVOICES_LIMIT = 100;

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/* Estados de pedido de Dolibarr. */
const ORDER_STATUS = {
  '-1': { label: 'Cancelado', cls: 'status-tag--cancelled' },
  '0':  { label: 'Borrador',  cls: 'status-tag--draft' },
  '1':  { label: 'Validado',  cls: 'status-tag--pending' },
  '2':  { label: 'En proceso', cls: 'status-tag--process' },
  '3':  { label: 'Cerrado',   cls: 'status-tag--paid' },
};

/* Pedidos que cuentan como "nuevos / pendientes de gestionar" en Dolibarr:
   0 = Borrador, 1 = Validado (equivalente a Nuevo/Pendiente). */
const NEW_ORDER_STATUSES = ['0', '1'];

/* Estado interno de la aplicación. */
const state = {
  configOk: Boolean(CONFIG.DOLIBARR_API_URL && CONFIG.DOLIBARR_API_TOKEN),
  apiOk: false,
  statusOk: false,
  orders: [],
  invoices: [],
  thirdparties: [],
  system: null,
  analytics: null,
  sku: null,
  charts: { quarter: null, infra: null, analytics: null },
  carousel: { index: 0, paused: false, timer: null },
};

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */
const $ = (selector) => document.querySelector(selector);

/** Formatea un importe en euros. */
function formatCurrency(value) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Convierte una fecha de Dolibarr (timestamp en segundos o ISO) a Date.
 * @returns {Date|null}
 */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  let date;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const seconds = Number(value);
    // Heurística: timestamps de Dolibarr vienen en segundos (< 10^12).
    date = new Date(seconds < 1e12 ? seconds * 1000 : seconds);
  } else {
    date = new Date(value);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Fecha de una factura, tolerando los distintos nombres de campo que puede
 * devolver la API REST de Dolibarr (`datef` en el objeto interno frente a
 * `date` en la representación JSON del endpoint `/invoices`).
 * @returns {Date|null}
 */
function invoiceDate(inv) {
  return toDate(inv?.datef ?? inv?.date);
}

/** Formatea una fecha al formato local corto. */
function formatDate(value) {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * Formatea una duración en segundos como uptime legible (p. ej. "3 d 4 h").
 * @param {number|string|null|undefined} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return '—';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

/** Escribe un valor en un KPI y actualiza su pista. */
function setKpi(id, value, hint) {
  const card = document.getElementById(id);
  if (!card) return;
  const valueEl = card.querySelector('[data-value]');
  const hintEl = card.querySelector('[data-hint]');
  if (valueEl) valueEl.textContent = value;
  if (hintEl && hint !== undefined) hintEl.textContent = hint;
}

/** Actualiza la marca de tiempo "última actualización". */
function setLastUpdate() {
  const el = $('#last-update');
  if (!el) return;
  const now = new Date();
  el.textContent = `Actualizado ${now.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** Muestra u oculta el banner de error. */
function setErrorBanner(message) {
  const banner = $('#error-banner');
  if (!banner) return;
  if (!message) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }
  banner.hidden = false;
  banner.textContent = message;
}

/** Actualiza el badge de conexión general del header. */
function setConnectionBadge(connectionState, text) {
  const badge = $('#conn-status');
  if (!badge) return;
  badge.dataset.state = connectionState;
  badge.innerHTML = `<span class="dot dot--${connectionState === 'ok' ? 'ok' : connectionState === 'warn' ? 'warn' : 'err'}"></span>${text}`;
}

/** Actualiza los badges de salud de servicios. */
function setHealthBadge(id, stateName, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.state = stateName;
  el.textContent = text;
}

/* --------------------------------------------------------------------------
   Alertas visuales de los KPI de infraestructura
   -------------------------------------------------------------------------- */
/* Reglas: temperatura >=80 °C -> danger, >=70 °C -> warning.
   CPU / RAM / Disco: >=85 % -> danger, >=70 % -> warning. */
const ALERT_RULES = {
  temperature: { warning: 70, danger: 80 },
  percentage: { warning: 70, danger: 85 },
};

/**
 * Devuelve el nivel de alerta ('danger' | 'warning' | null) para un valor.
 * @param {number|string|null|undefined} value
 * @param {{warning:number, danger:number}} rule
 * @returns {'danger'|'warning'|null}
 */
function alertLevel(value, rule) {
  if (value === null || value === undefined || value === '') return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (v >= rule.danger) return 'danger';
  if (v >= rule.warning) return 'warning';
  return null;
}

/**
 * Aplica o retira las clases de alerta (.warning / .danger) en una tarjeta KPI.
 * @param {string} id
 * @param {'danger'|'warning'|null} level
 */
function applyKpiAlert(id, level) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.toggle('warning', level === 'warning');
  card.classList.toggle('danger', level === 'danger');
  card.dataset.alert = level || 'ok';
}

/* --------------------------------------------------------------------------
   Banner global persistente de alertas (sistema + negocio)
   -------------------------------------------------------------------------- */
/**
 * Construye el contenido del banner global de alertas.
 *
 * - REGLA 1 (Sistema, crítica · Rosa Coral): temperatura ≥ 80 °C, CPU o RAM
 *   ≥ 85 %, `backup_status === 'ERROR'` o `bridge_status` ausente o distinto de
 *   `'OK'` (también si `status.json` no responde). La regla del puente queda
 *   alineada con el badge del Panel 3 (`renderInfra`): sin dato no hay garantía
 *   de salud y se marca ERROR.
 * - REGLA 2 (Negocio, aviso · Amarillo Limón): pedidos de Dolibarr en estado
 *   Borrador/Validado (nuevos, pendientes de gestionar).
 * - REGLA 3 (Datos, aviso · Amarillo Limón): desajuste de SKUs entre la Tienda
 *   (WooCommerce) y el ERP (Dolibarr), según `sku_status.json` del auditor.
 *
 * Las alertas de sistema tienen prioridad y, si coexisten con las de negocio o
 * de datos, se muestran apiladas (sistema arriba). Sin alertas, el banner se
 * oculta.
 */
function updateGlobalBanner() {
  const banner = document.getElementById('global-alert-banner');
  if (!banner) return;

  const alerts = [];
  const sys = state.system;

  /* REGLA 1 — Sistema (crítico). */
  if (!sys) {
    alerts.push({
      level: 'critical',
      text: '⚠️ ALERTA DE SISTEMA: Sin datos de status.json (la Orange Pi no responde)',
    });
  } else {
    const reasons = [];
    const temp = Number(sys.temperature_celsius);
    const cpu = Number(sys.cpu?.usage_percent);
    const ram = Number(sys.memory?.usage_percent);

    if (Number.isFinite(temp) && temp >= ALERT_RULES.temperature.danger) {
      reasons.push(`Temperatura Crítica (${temp.toFixed(1)} °C)`);
    }
    if (Number.isFinite(cpu) && cpu >= ALERT_RULES.percentage.danger) {
      reasons.push(`CPU al ${cpu.toFixed(0)} %`);
    }
    if (Number.isFinite(ram) && ram >= ALERT_RULES.percentage.danger) {
      reasons.push(`RAM al ${ram.toFixed(0)} %`);
    }
    if (String(sys.backup_status || '').toUpperCase() === 'ERROR') {
      reasons.push('Backup con Error');
    }
    // Alineado con el badge del Panel 3: el puente se considera caído tanto si
    // observability.sh lo marca como ERROR como si la clave bridge_status está
    // ausente (status.json antiguo o puente sin desplegar): sin dato no hay
    // garantía de salud.
    if (String(sys.bridge_status || '').toUpperCase() !== 'OK') {
      reasons.push('Puente Web Caído');
    }

    if (reasons.length) {
      alerts.push({
        level: 'critical',
        text: `⚠️ ALERTA DE SISTEMA: ${reasons.join(' · ')}`,
      });
    }
  }

  /* REGLA 2 — Negocio: pedidos nuevos/pendientes. */
  const pendingOrders = state.orders.filter((ord) =>
    NEW_ORDER_STATUSES.includes(String(ord.statut))
  );
  if (pendingOrders.length) {
    alerts.push({
      level: 'warning',
      text:
        pendingOrders.length === 1
          ? '📦 Tienes 1 pedido nuevo pendiente de gestionar'
          : `📦 Tienes ${pendingOrders.length} pedidos nuevos pendientes de gestionar`,
    });
  }

  /* REGLA 3 — Datos: desajuste de SKUs entre Tienda y ERP. */
  const skuCount = skuMismatchCount(state.sku);
  if (skuCount !== null && skuCount > 0) {
    const inStore = (state.sku.missing_in_dolibarr || []).length;
    const inErp = (state.sku.missing_in_wordpress || []).length;
    alerts.push({
      level: 'warning',
      text:
        '⚠️ Desajuste de SKUs detectado entre Tienda y ERP · ' +
        `${inStore} en Tienda sin ERP · ${inErp} en ERP sin Tienda`,
    });
  }

  if (!alerts.length) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }

  banner.classList.remove('hidden');
  banner.innerHTML = alerts
    .map(
      (alert) =>
        `<div class="global-alert-banner__item global-alert-banner__item--${alert.level}">${escapeHtml(alert.text)}</div>`
    )
    .join('');
}

/* --------------------------------------------------------------------------
   Fechas / trimestre
   -------------------------------------------------------------------------- */
function getQuarter(date = new Date()) {
  return Math.floor(date.getMonth() / 3) + 1;
}

function getQuarterMonths(quarter) {
  const start = (quarter - 1) * 3;
  return [start, start + 1, start + 2];
}

/** Indica si una fecha cae dentro del trimestre/año indicados. */
function isInQuarter(date, quarter, year) {
  if (!date) return false;
  return date.getFullYear() === year && Math.floor(date.getMonth() / 3) + 1 === quarter;
}

/* --------------------------------------------------------------------------
   Fuente de datos 1 — API REST de Dolibarr
   -------------------------------------------------------------------------- */
/**
 * Lanza una petición GET a la API REST de Dolibarr.
 * @returns {Promise<Array>}
 */
async function dolibarrGet(resource, params = '') {
  const { DOLIBARR_API_URL, DOLIBARR_API_TOKEN } = CONFIG;
  const url = `${DOLIBARR_API_URL}/${resource}${params ? `?${params}` : ''}`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      DOLAPIKEY: DOLIBARR_API_TOKEN,
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Token inválido o sin permisos (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en /${resource}`);
  }

  const data = await res.json();
  if (data && data.error) {
    throw new Error(data.error.message || `Error en /${resource}`);
  }
  return Array.isArray(data) ? data : [];
}

/**
 * Obtiene pedidos, facturas y terceros desde la API REST de Dolibarr.
 * @returns {Promise<void>}
 */
async function fetchDolibarrData() {
  if (!state.configOk) {
    state.apiOk = false;
    setErrorBanner(
      'Falta configuración de Dolibarr. Copia config.example.js a config.js y rellena la URL y el token.'
    );
    return;
  }

  try {
    const [orders, invoices, thirdparties] = await Promise.all([
      dolibarrGet('orders', `limit=${ORDERS_LIMIT}&sortfield=t.date_commande&sortorder=DESC`),
      dolibarrGet('invoices', `limit=${INVOICES_LIMIT}&sortfield=t.datef&sortorder=DESC`),
      dolibarrGet('thirdparties', 'limit=200&sortfield=t.nom&sortorder=ASC'),
    ]);

    state.orders = orders;
    state.invoices = invoices;
    state.thirdparties = thirdparties;
    state.apiOk = true;

    setErrorBanner('');
    console.info(
      `[Monli Kiosk] Dolibarr OK — ${orders.length} pedidos, ${invoices.length} facturas, ${thirdparties.length} terceros.`
    );
  } catch (error) {
    state.apiOk = false;
    console.error('[Monli Kiosk] Error al consultar Dolibarr:', error);
    setErrorBanner(`No se pudo conectar con Dolibarr: ${error.message}`);
  }
}

/* --------------------------------------------------------------------------
   Fuente de datos 2 — status.json de la Orange Pi
   -------------------------------------------------------------------------- */
/**
 * Obtiene el estado del dispositivo desde status.json.
 * @returns {Promise<void>}
 */
async function fetchSystemStatus() {
  try {
    const res = await fetch(STATUS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.system = await res.json();
    state.statusOk = true;
    console.info('[Monli Kiosk] status.json recibido.', state.system);
  } catch (error) {
    state.system = null;
    state.statusOk = false;
    console.warn('[Monli Kiosk] status.json no disponible:', error.message);
  }
}

/* --------------------------------------------------------------------------
   Fuente de datos 4 — Auditoría de SKUs (Tienda ↔ ERP)
   El script `/opt/monli/scripts/sku_auditor.php` (cron de root cada 12 h)
   publica `./sku_status.json` en el webroot del kiosco. Compara los SKUs de
   WooCommerce con las referencias vendibles de Dolibarr. Si el fichero no
   existe o la auditoría falla, se muestra «Sin datos» y NO se alerta (evita
   falsos positivos).
   -------------------------------------------------------------------------- */
async function fetchSkuStatus() {
  try {
    const res = await fetch(SKU_STATUS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== 'object') throw new Error('JSON inválido');
    console.info('[Monli Kiosk] sku_status.json recibido.', data);
    return data;
  } catch (error) {
    console.warn('[Monli Kiosk] sku_status.json no disponible.', error.message);
    return null;
  }
}

/**
 * Número de desajustes de SKUs, o `null` si no hay datos válidos (fichero
 * ausente o auditoría con error). Un `null` NUNCA dispara alertas.
 * @returns {number|null}
 */
function skuMismatchCount(sku) {
  if (!sku || typeof sku !== 'object' || sku.error) return null;
  const n = Number(sku.mismatch_count);
  return Number.isFinite(n) ? n : null;
}

/** Actualiza el badge de SKUs (Panel 3) y avisa por consola si hay desajuste. */
function renderSkuBadge() {
  const el = document.getElementById('sku-badge');
  const count = skuMismatchCount(state.sku);
  if (count === null) {
    setHealthBadge('sku-badge', 'pending', 'Sin datos');
    if (el) el.title = 'Sin auditoría de SKUs todavía (sku_status.json ausente o con error).';
    return;
  }
  const inStore = (state.sku.missing_in_dolibarr || []).length;
  const inErp = (state.sku.missing_in_wordpress || []).length;
  if (count > 0) {
    setHealthBadge('sku-badge', 'warn', `Desajuste (${count})`);
    if (el) el.title = `Tienda sin ERP: ${inStore} · ERP sin tienda: ${inErp}`;
    console.warn(
      `[Monli Kiosk] Desajuste de SKUs: ${inStore} en Tienda sin ERP, ${inErp} en ERP sin Tienda.`
    );
  } else {
    setHealthBadge('sku-badge', 'ok', 'OK');
    if (el) el.title = 'SKUs de Tienda y ERP alineados.';
  }
}

/* --------------------------------------------------------------------------
   Cálculos del dashboard
   -------------------------------------------------------------------------- */
/**
 * Calcula métricas financieras y de pedidos del trimestre actual.
 * @returns {Object}
 */
function computeMetrics() {
  const now = new Date();
  const quarter = getQuarter(now);
  const year = now.getFullYear();
  const months = getQuarterMonths(quarter);

  const invoicesQuarter = state.invoices.filter((inv) => isInQuarter(invoiceDate(inv), quarter, year));
  const ordersQuarter = state.orders.filter((ord) => isInQuarter(toDate(ord.date_commande), quarter, year));

  const totalInvoicedQuarter = invoicesQuarter.reduce((sum, inv) => sum + (Number(inv.total_ttc) || 0), 0);
  const totalInvoicedMonth = invoicesQuarter
    .filter((inv) => invoiceDate(inv)?.getMonth() === now.getMonth())
    .reduce((sum, inv) => sum + (Number(inv.total_ttc) || 0), 0);

  const pendingInvoices = state.invoices.filter(
    (inv) => Number(inv.paye) !== 1 && Number(inv.statut) !== 3
  );
  const totalPending = pendingInvoices.reduce((sum, inv) => sum + (Number(inv.total_ttc) || 0), 0);

  // Serie mensual del trimestre (facturado / pendiente).
  const monthly = months.map((monthIndex) => {
    const monthInvoices = invoicesQuarter.filter((inv) => invoiceDate(inv)?.getMonth() === monthIndex);
    const invoiced = monthInvoices.reduce((sum, inv) => sum + (Number(inv.total_ttc) || 0), 0);
    const pending = monthInvoices
      .filter((inv) => Number(inv.paye) !== 1 && Number(inv.statut) !== 3)
      .reduce((sum, inv) => sum + (Number(inv.total_ttc) || 0), 0);
    return { label: MONTHS_ES[monthIndex], invoiced, pending };
  });

  const processing = ordersQuarter.filter((ord) => ['1', '2'].includes(String(ord.statut)));

  // "Dinero en vuelo": pedidos del trimestre que NO están cancelados y que
  // todavía NO se han facturado en el ERP (`billed` distinto de 1). Refleja el
  // valor económico de los pedidos entrantes antes de emitir factura.
  const inflightOrders = ordersQuarter.filter(
    (ord) => String(ord.statut) !== '-1' && Number(ord.billed) !== 1
  );
  const moneyInFlight = inflightOrders.reduce((sum, ord) => sum + (Number(ord.total_ttc) || 0), 0);

  return {
    quarter,
    year,
    months,
    monthly,
    totalInvoicedQuarter,
    totalInvoicedMonth,
    totalPending,
    ordersQuarterCount: ordersQuarter.length,
    processingCount: processing.length,
    recentOrders: state.orders.slice(0, 12),
    ordersTotal: ordersQuarter.reduce((sum, ord) => sum + (Number(ord.total_ttc) || 0), 0),
    pendingInvoicesCount: pendingInvoices.length,
    moneyInFlight,
    inflightCount: inflightOrders.length,
  };
}

/** Mapa id de tercero -> nombre. */
function thirdpartyName(socid) {
  const found = state.thirdparties.find((tp) => String(tp.id) === String(socid));
  return found ? (found.name || found.nom || `#${socid}`) : `#${socid}`;
}

/* --------------------------------------------------------------------------
   Render — Panel 1: finanzas
   -------------------------------------------------------------------------- */
function renderFinance(metrics) {
  setKpi(
    'kpi-revenue-quarter',
    formatCurrency(metrics.totalInvoicedQuarter),
    `T${metrics.quarter} ${metrics.year} · ${metrics.pendingInvoicesCount} facturas pendientes`
  );
  setKpi(
    'kpi-inflight',
    formatCurrency(metrics.moneyInFlight),
    `Dinero en vuelo · ${metrics.inflightCount} pedido(s) sin facturar en T${metrics.quarter} ${metrics.year}`
  );
  setKpi('kpi-revenue-month', formatCurrency(metrics.totalInvoicedMonth), 'Facturación del mes en curso');
  setKpi(
    'kpi-orders-quarter',
    String(metrics.ordersQuarterCount),
    `T${metrics.quarter} ${metrics.year} · ${metrics.processingCount} en proceso`
  );
  setKpi(
    'kpi-invoices-pending',
    formatCurrency(metrics.totalPending),
    `${metrics.pendingInvoicesCount} factura(s) por cobrar`
  );

  const quarterLabel = $('#quarter-label');
  if (quarterLabel) quarterLabel.textContent = `T${metrics.quarter} ${metrics.year}`;

  const quarterBadge = $('#quarter-badge');
  if (quarterBadge) quarterBadge.textContent = `${metrics.monthly.length} meses`;

  renderQuarterChart(metrics);
}

/** Crea o actualiza el gráfico trimestral. */
function renderQuarterChart(metrics) {
  const canvas = $('#chart-quarter');
  if (!canvas || !window.Chart) return;

  const labels = metrics.monthly.map((m) => m.label);
  const invoiced = metrics.monthly.map((m) => Number(m.invoiced.toFixed(2)));
  const pending = metrics.monthly.map((m) => Number(m.pending.toFixed(2)));
  const hasData = invoiced.some((v) => v > 0) || pending.some((v) => v > 0);

  const emptyMsg = $('#chart-quarter-empty');
  if (emptyMsg) emptyMsg.hidden = hasData;

  const data = {
    labels,
    datasets: [
      {
        label: 'Facturado',
        data: invoiced,
        backgroundColor: 'rgba(118, 204, 182, 0.85)',
        borderColor: '#76CCB6',
        borderWidth: 1,
        borderRadius: 8,
        stack: 'ingresos',
      },
      {
        label: 'Pendiente',
        data: pending,
        backgroundColor: 'rgba(241, 208, 119, 0.85)',
        borderColor: '#F1D077',
        borderWidth: 1,
        borderRadius: 8,
        stack: 'ingresos',
      },
    ],
  };

  if (state.charts.quarter) {
    state.charts.quarter.data = data;
    state.charts.quarter.update();
    return;
  }

  state.charts.quarter = new Chart(canvas, {
    type: 'bar',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 8, padding: 18, font: { weight: '600' } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { weight: '600' } } },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: 'rgba(85, 96, 122, 0.08)' },
          ticks: {
            callback: (value) =>
              new Intl.NumberFormat('es-ES', { notation: 'compact', style: 'currency', currency: 'EUR' }).format(value),
          },
        },
      },
    },
  });
}

/* --------------------------------------------------------------------------
   Render — Panel 2: pedidos
   -------------------------------------------------------------------------- */
function renderOrders(metrics) {
  const body = $('#orders-body');
  if (!body) return;

  const orders = metrics.recentOrders;

  const countEl = $('#orders-count');
  if (countEl) countEl.textContent = String(orders.length);
  const processingEl = $('#orders-processing');
  if (processingEl) processingEl.textContent = String(metrics.processingCount);
  const totalEl = $('#orders-total');
  if (totalEl) totalEl.textContent = formatCurrency(metrics.ordersTotal);
  const badge = $('#orders-badge');
  if (badge) badge.textContent = `${orders.length} últimos`;

  if (!orders.length) {
    body.innerHTML = `<tr class="orders-table__empty"><td colspan="5">Sin pedidos registrados en Dolibarr.</td></tr>`;
    return;
  }

  body.innerHTML = orders
    .map((ord) => {
      const status = ORDER_STATUS[String(ord.statut)] || { label: '—', cls: '' };
      const ref = ord.ref || `#${ord.id}`;
      const client = thirdpartyName(ord.socid);
      return `
        <tr>
          <td>${escapeHtml(ref)}</td>
          <td>${escapeHtml(client)}</td>
          <td>${formatDate(ord.date_commande)}</td>
          <td>${formatCurrency(ord.total_ttc)}</td>
          <td><span class="status-tag ${status.cls}">${escapeHtml(status.label)}</span></td>
        </tr>`;
    })
    .join('');
}

/** Escapa texto para insertarlo en HTML. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

/* --------------------------------------------------------------------------
   Render — Panel 3: infraestructura
   -------------------------------------------------------------------------- */
function renderInfra() {
  const sys = state.system;

  if (!sys) {
    setKpi('metric-cpu', '—', 'Sin datos');
    setKpi('metric-ram', '—', 'Sin datos');
    setKpi('metric-temp', '—', 'Sin datos');
    setKpi('metric-disk', '—', 'Sin datos');
    applyKpiAlert('metric-cpu', null);
    applyKpiAlert('metric-ram', null);
    applyKpiAlert('metric-temp', null);
    applyKpiAlert('metric-disk', null);
    setHealthBadge('health-status', 'err', 'No disponible');
    setHealthBadge('bridge-badge', 'err', 'Sin datos');
    const uptimeNullEl = $('#sys-uptime');
    if (uptimeNullEl) uptimeNullEl.textContent = '—';
    renderTrendChart(null);
    return;
  }

  const cpu = Number(sys.cpu?.usage_percent) || 0;
  const ram = Number(sys.memory?.usage_percent) || 0;
  const disk = Number(sys.disk?.usage_percent) || 0;
  const temp = sys.temperature_celsius;

  setKpi('metric-cpu', `${cpu.toFixed(1)} %`, 'Uso medio');
  setKpi(
    'metric-ram',
    `${ram.toFixed(1)} %`,
    sys.memory ? `${sys.memory.used_mb} / ${sys.memory.total_mb} MB` : '—'
  );
  setKpi('metric-temp', temp === null || temp === undefined ? '—' : `${Number(temp).toFixed(1)} °C`, 'Sensor de la placa');
  setKpi(
    'metric-disk',
    `${disk.toFixed(1)} %`,
    sys.disk ? `${sys.disk.used_gb} / ${sys.disk.total_gb} GB` : '—'
  );

  const infraTime = $('#infra-timestamp');
  if (infraTime) {
    infraTime.textContent = sys.timestamp
      ? new Date(sys.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '—';
  }

  // Uptime del sistema ("Activo desde"): segundos desde el arranque.
  const uptimeEl = $('#sys-uptime');
  if (uptimeEl) uptimeEl.textContent = formatUptime(sys.uptime_seconds);

  // Backup
  const backupStatus = String(sys.backup_status || '').toUpperCase();
  if (backupStatus === 'OK') setHealthBadge('backup-badge', 'ok', 'OK');
  else if (backupStatus === 'WARNING') setHealthBadge('backup-badge', 'warn', 'Atención');
  else setHealthBadge('backup-badge', 'err', backupStatus || '—');

  const ageEl = $('#backup-age');
  if (ageEl) {
    ageEl.textContent = sys.backup_age_hours !== undefined && sys.backup_age_hours !== null
      ? `${Number(sys.backup_age_hours).toFixed(1)} h`
      : '—';
  }

  // Puente WooCommerce ➔ Dolibarr (bridge_status). Se considera ERROR tanto si
  // observability.sh lo marca explícitamente como si la clave no existe (JSON
  // antiguo o bridge sin desplegar): sin dato no hay garantía de salud.
  const bridgeStatus = String(sys.bridge_status || '').toUpperCase();
  const bridgeEl = $('#bridge-badge');
  if (bridgeStatus === 'OK') {
    setHealthBadge('bridge-badge', 'ok', 'OK');
    if (bridgeEl) bridgeEl.title = 'Puente WooCommerce ➔ Dolibarr operativo';
  } else {
    setHealthBadge('bridge-badge', 'err', bridgeStatus === 'ERROR' ? 'ERROR' : 'Sin datos');
    if (bridgeEl) {
      bridgeEl.title = sys.bridge_age_minutes !== undefined && sys.bridge_age_minutes !== null
        ? `Puente con error · último log hace ${Number(sys.bridge_age_minutes).toFixed(1)} min`
        : 'Puente con error o sin datos en status.json';
    }
    console.error(
      `[Monli Kiosk] ¡Atención! Puente WooCommerce (bridge_status=${bridgeStatus || 'ausente'})` +
        (sys.bridge_age_minutes !== undefined && sys.bridge_age_minutes !== null
          ? ` — último log hace ${Number(sys.bridge_age_minutes).toFixed(1)} min.`
          : '.')
    );
  }

  setHealthBadge('health-status', 'ok', 'OK');

  /* Alertas visuales según umbrales. */
  applyKpiAlert('metric-temp', alertLevel(temp, ALERT_RULES.temperature));
  applyKpiAlert('metric-cpu', alertLevel(cpu, ALERT_RULES.percentage));
  applyKpiAlert('metric-ram', alertLevel(ram, ALERT_RULES.percentage));
  applyKpiAlert('metric-disk', alertLevel(disk, ALERT_RULES.percentage));

  renderTrendChart(sys.history);
}

/**
 * Crea o actualiza la línea de tendencia (últimas 2 h) con la temperatura y
 * el uso de CPU a partir del array `history` de status.json.
 * @param {Array<{timestamp:string,cpu_pct:number,ram_pct:number,temp_c:number|null}>|null} history
 */
function renderTrendChart(history) {
  const canvas = $('#chart-trend');
  if (!canvas || !window.Chart) return;

  const entries = Array.isArray(history) ? history.slice(-24) : [];
  const hasData = entries.length > 0;

  const emptyMsg = $('#chart-trend-empty');
  if (emptyMsg) emptyMsg.hidden = hasData;

  const labels = entries.map((entry) => {
    const date = new Date(entry.timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  });

  const toNumber = (value) =>
    value === null || value === undefined || value === '' ? null : Number(value);

  const temperatures = entries.map((entry) => toNumber(entry.temp_c));
  const cpuValues = entries.map((entry) => toNumber(entry.cpu_pct));

  const data = {
    labels,
    datasets: [
      {
        label: 'Temperatura (°C)',
        data: temperatures,
        borderColor: '#FF8FA3',
        backgroundColor: 'rgba(255, 143, 163, 0.14)',
        fill: true,
        tension: 0.35,
        spanGaps: true,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
        yAxisID: 'yTemp',
      },
      {
        label: 'CPU (%)',
        data: cpuValues,
        borderColor: '#76CCB6',
        backgroundColor: 'rgba(118, 204, 182, 0.12)',
        fill: true,
        tension: 0.35,
        spanGaps: true,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
        yAxisID: 'yPct',
      },
    ],
  };

  if (state.charts.infra) {
    state.charts.infra.data = data;
    state.charts.infra.update();
    return;
  }

  state.charts.infra = new Chart(canvas, {
    type: 'line',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 8, padding: 16, font: { weight: '600' } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}${ctx.dataset.yAxisID === 'yTemp' ? ' °C' : ' %'}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 8, font: { weight: '600' } },
        },
        yTemp: {
          position: 'left',
          beginAtZero: false,
          suggestedMin: 40,
          suggestedMax: 90,
          grid: { color: 'rgba(85, 96, 122, 0.08)' },
          ticks: { callback: (v) => `${v}°C` },
        },
        yPct: {
          position: 'right',
          beginAtZero: true,
          max: 100,
          grid: { display: false },
          ticks: { callback: (v) => `${v}%` },
        },
      },
    },
  });
}

/* --------------------------------------------------------------------------
   Fuente de datos 3 — Analítica web (Panel 4)
   Los datos provienen de `./analytics.json`, que publica el proxy de GA4
   (`/opt/monli/scripts/fetch_ga4.py`) en el propio webroot del kiosco. Si el
   fichero no existe, falla o viene a cero, el Panel 4 muestra un estado vacío
   elegante («Esperando recolección de datos...»); NUNCA se inyectan datos
   falsos.
   -------------------------------------------------------------------------- */

/**
 * Obtiene los datos de analítica web desde el proxy de GA4 (`./analytics.json`).
 * Devuelve `null` si el fichero no existe, falla o no es un objeto válido.
 * @returns {Promise<Object|null>}
 */
async function fetchAnalyticsData() {
  try {
    const res = await fetch('./analytics.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== 'object') throw new Error('JSON inválido');
    console.info('[Monli Kiosk] analytics.json recibido.', data);
    return data;
  } catch (error) {
    console.warn('[Monli Kiosk] analytics.json no disponible.', error.message);
    return null;
  }
}

/**
 * Determina si el payload de analítica contiene tráfico real. Un fichero válido
 * pero todo a cero (propiedad GA4 aún sin visitas) se considera «sin datos».
 * @param {Object|null} data
 * @returns {boolean}
 */
function analyticsHasData(data) {
  if (!data || typeof data !== 'object') return false;
  const totals =
    (Number(data.usersToday) || 0) +
    (Number(data.users7d) || 0) +
    (Number(data.sessions7d) || 0) +
    (Number(data.pageviews7d) || 0);
  const weekly = Array.isArray(data.weekly)
    ? data.weekly.reduce(
        (acc, row) =>
          acc + (Number(row.visitors) || 0) + (Number(row.sessions) || 0),
        0
      )
    : 0;
  return totals > 0 || weekly > 0;
}

/** Formatea un número entero con separadores de miles (es-ES). */
function formatNumber(value) {
  return new Intl.NumberFormat('es-ES').format(Number(value) || 0);
}

/** Render del Panel 4: KPIs de tráfico y gráfico de visitantes semanales. */
function renderAnalytics(data = state.analytics) {
  const hasData = analyticsHasData(data);

  const label = $('#analytics-label');
  if (label) label.textContent = hasData ? 'últimos 7 días' : 'sin datos';

  const badge = $('#analytics-badge');
  if (badge) {
    badge.textContent = hasData ? 'En vivo' : 'Esperando datos';
    badge.dataset.state = hasData ? 'ok' : 'idle';
  }

  if (!hasData) {
    // Estado vacío elegante: nunca se inyectan datos falsos.
    setKpi('kpi-users-today', '—', 'Esperando recolección de datos...');
    setKpi('kpi-sessions', '—', 'Sin tráfico registrado');
    setKpi('kpi-pageviews', '—', 'Sin tráfico registrado');
    renderAnalyticsChart([]);
    return;
  }

  setKpi('kpi-users-today', formatNumber(data.usersToday), 'Usuarios activos hoy');
  setKpi('kpi-sessions', formatNumber(data.sessions7d), 'Últimos 7 días');
  setKpi('kpi-pageviews', formatNumber(data.pageviews7d), 'Últimos 7 días');

  renderAnalyticsChart(data.weekly);
}

/**
 * Crea o actualiza el gráfico de líneas de visitantes y sesiones (Menta y
 * Amarillo Limón) a partir de la serie semanal.
 * @param {Array<{label:string,visitors:number,sessions:number}>} weekly
 */
function renderAnalyticsChart(weekly) {
  const canvas = $('#chart-analytics');
  const emptyMsg = $('#chart-analytics-empty');

  const rows = Array.isArray(weekly) ? weekly : [];
  const hasData = rows.some(
    (row) => (Number(row.visitors) || 0) + (Number(row.sessions) || 0) > 0
  );

  if (emptyMsg) emptyMsg.hidden = hasData;
  if (canvas) canvas.hidden = !hasData;

  if (!hasData) {
    // Sin serie real: se destruye cualquier gráfico previo y se muestra el
    // estado vacío. Nunca se dibujan datos falsos.
    if (state.charts.analytics) {
      state.charts.analytics.destroy();
      state.charts.analytics = null;
    }
    return;
  }

  if (!canvas || !window.Chart) return;

  const data = {
    labels: rows.map((row) => row.label),
    datasets: [
      {
        label: 'Visitantes',
        data: rows.map((row) => Number(row.visitors)),
        borderColor: '#76CCB6',
        backgroundColor: 'rgba(118, 204, 182, 0.16)',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2.5,
      },
      {
        label: 'Sesiones',
        data: rows.map((row) => Number(row.sessions)),
        borderColor: '#F1D077',
        backgroundColor: 'rgba(241, 208, 119, 0.18)',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2.5,
      },
    ],
  };

  if (state.charts.analytics) {
    state.charts.analytics.data = data;
    state.charts.analytics.update();
    return;
  }

  state.charts.analytics = new Chart(canvas, {
    type: 'line',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 8, padding: 16, font: { weight: '600' } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { weight: '600' } } },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(85, 96, 122, 0.08)' },
          ticks: { precision: 0 },
        },
      },
    },
  });
}

/* --------------------------------------------------------------------------
   Render general
   -------------------------------------------------------------------------- */
async function render() {
  setLastUpdate();

  const [analytics, sku] = await Promise.all([
    fetchAnalyticsData(),
    fetchDolibarrData(),
    fetchSystemStatus(),
    fetchSkuStatus(),
  ]);
  state.analytics = analytics;
  state.sku = sku;

  const metrics = computeMetrics();
  renderFinance(metrics);
  renderOrders(metrics);
  renderInfra();
  renderAnalytics();
  renderSkuBadge();

  // Banner global de alertas (sistema + negocio + desajuste de SKUs).
  updateGlobalBanner();

  // Estado de conexión general.
  if (!state.configOk) {
    setConnectionBadge('err', 'Sin configurar');
  } else if (state.apiOk && state.statusOk) {
    setConnectionBadge('ok', 'Operativo');
  } else if (state.apiOk || state.statusOk) {
    setConnectionBadge('warn', 'Parcial');
  } else {
    setConnectionBadge('err', 'Sin conexión');
  }

  setHealthBadge('health-api', state.apiOk ? 'ok' : 'err', state.apiOk ? 'OK' : 'Error');
}

/* --------------------------------------------------------------------------
   Carrusel automático
   -------------------------------------------------------------------------- */
function setupCarousel() {
  const carousel = $('#carousel');
  const progressBar = $('#carousel-progress-bar');
  const stateLabel = $('#carousel-state');
  const stateText = $('#carousel-state-text');
  const slides = Array.from(carousel.querySelectorAll('.slide'));
  const dots = Array.from(document.querySelectorAll('.carousel-dot'));

  function updateStateLabel() {
    if (!stateLabel || !stateText) return;
    stateLabel.dataset.paused = String(state.carousel.paused);
    stateText.textContent = state.carousel.paused
      ? 'Carrusel en pausa'
      : `Carrusel activo · ${CAROUSEL_INTERVAL_MS / 1000} s`;
  }

  function restartProgress() {
    if (!progressBar) return;
    progressBar.classList.remove('is-animating');
    // Fuerza reflow para reiniciar la animación CSS.
    void progressBar.offsetWidth;
    progressBar.classList.toggle('is-paused', state.carousel.paused);
    if (!state.carousel.paused) progressBar.classList.add('is-animating');
  }

  function schedule() {
    clearTimeout(state.carousel.timer);
    if (state.carousel.paused) return;
    restartProgress();
    state.carousel.timer = setTimeout(next, CAROUSEL_INTERVAL_MS);
  }

  function goTo(index, { auto = false } = {}) {
    const total = slides.length;
    const nextIndex = ((index % total) + total) % total;
    state.carousel.index = nextIndex;

    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === nextIndex);
      slide.classList.toggle('is-prev', i < nextIndex);
    });
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === nextIndex));

    if (auto || !state.carousel.paused) schedule();
    else restartProgress();
  }

  function next() {
    goTo(state.carousel.index + 1, { auto: true });
  }

  function prev() {
    goTo(state.carousel.index - 1);
  }

  function pause() {
    if (state.carousel.paused) return;
    state.carousel.paused = true;
    clearTimeout(state.carousel.timer);
    if (progressBar) progressBar.classList.add('is-paused');
    updateStateLabel();
  }

  function resume() {
    if (!state.carousel.paused) return;
    state.carousel.paused = false;
    updateStateLabel();
    schedule();
  }

  // Controles manuales.
  document.querySelectorAll('[data-goto]').forEach((dot) => {
    dot.addEventListener('click', () => goTo(Number(dot.dataset.goto)));
  });
  $('#carousel-next')?.addEventListener('click', next);
  $('#carousel-prev')?.addEventListener('click', prev);

  // Pausa al mover el ratón por encima o al tocar la pantalla.
  carousel.addEventListener('mouseenter', pause);
  carousel.addEventListener('mousemove', pause);
  carousel.addEventListener('mouseleave', resume);
  carousel.addEventListener('touchstart', pause, { passive: true });

  // Toggle manual de pausa desde la etiqueta inferior.
  stateLabel?.addEventListener('click', () => (state.carousel.paused ? resume() : pause()));

  // Teclado.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') next();
    else if (event.key === 'ArrowLeft') prev();
    else if (event.key === ' ') {
      event.preventDefault();
      state.carousel.paused ? resume() : pause();
    }
  });

  updateStateLabel();
  goTo(0, { auto: true });
}

/* --------------------------------------------------------------------------
   Inicialización
   -------------------------------------------------------------------------- */
function configureChartsDefaults() {
  if (!window.Chart) return;
  Chart.defaults.font.family = "'Quicksand', system-ui, -apple-system, 'Segoe UI', sans-serif";
  Chart.defaults.font.weight = '600';
  Chart.defaults.color = '#55607A';
}

async function init() {
  console.log('%c🍋 Monli Kiosk', 'color:#76CCB6;font-weight:bold;font-size:14px;', 'inicializado (4 paneles + banner global de alertas).');

  configureChartsDefaults();
  setupCarousel();

  if (!window.Chart) {
    console.warn('[Monli Kiosk] Chart.js no disponible; los gráficos no se mostrarán.');
    setErrorBanner('No se pudo cargar Chart.js (CDN). Los gráficos no están disponibles.');
  }

  await render();
  setInterval(render, REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', init);

/* Exposición para depuración desde la consola. */
window.MonliKiosk = {
  init,
  render,
  computeMetrics,
  renderFinance,
  fetchDolibarrData,
  fetchSystemStatus,
  fetchAnalyticsData,
  fetchSkuStatus,
  renderAnalytics,
  renderSkuBadge,
  skuMismatchCount,
  updateGlobalBanner,
  dolibarrGet,
  state,
};
