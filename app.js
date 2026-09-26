/* ==========================================================================
   Monli Kiosk — Lógica de la aplicación
   Fase 1: inicialización y preparación de las fuentes de datos.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   Configuración
   -------------------------------------------------------------------------- */
const CONFIG = window.MONLI_CONFIG || {};

const STATUS_URL = './status.json';

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
  }).format(num);
}

/** Formatea una fecha ISO a formato local corto. */
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
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

/* --------------------------------------------------------------------------
   Fuente de datos 1 — API REST de Dolibarr
   -------------------------------------------------------------------------- */
/**
 * Obtiene pedidos y facturas desde la API REST de Dolibarr.
 * Requiere DOLIBARR_API_URL y DOLIBARR_API_TOKEN en config.js.
 *
 * @returns {Promise<{orders: Array, invoices: Array}>}
 */
async function fetchDolibarrData() {
  const { DOLIBARR_API_URL, DOLIBARR_API_TOKEN } = CONFIG;

  if (!DOLIBARR_API_URL || !DOLIBARR_API_TOKEN) {
    console.warn(
      '[Monli Kiosk] Falta configuración de Dolibarr. ' +
        'Copia config.example.js a config.js y rellena la URL y el token.'
    );
    return { orders: [], invoices: [] };
  }

  const headers = {
    Accept: 'application/json',
    DOLAPIKEY: DOLIBARR_API_TOKEN,
  };

  try {
    const [ordersRes, invoicesRes] = await Promise.all([
      fetch(`${DOLIBARR_API_URL}/orders?limit=10&sortfield=t.date_commande&sortorder=DESC`, { headers }),
      fetch(`${DOLIBARR_API_URL}/invoices?limit=10&sortfield=t.datef&sortorder=DESC`, { headers }),
    ]);

    if (!ordersRes.ok) throw new Error(`Pedidos: HTTP ${ordersRes.status}`);
    if (!invoicesRes.ok) throw new Error(`Facturas: HTTP ${invoicesRes.status}`);

    const orders = await ordersRes.json();
    const invoices = await invoicesRes.json();

    console.info(`[Monli Kiosk] Dolibarr OK — ${orders.length} pedidos, ${invoices.length} facturas.`);
    return { orders, invoices };
  } catch (error) {
    console.error('[Monli Kiosk] Error al consultar Dolibarr:', error);
    return { orders: [], invoices: [] };
  }
}

/* --------------------------------------------------------------------------
   Fuente de datos 2 — status.json de la Orange Pi
   -------------------------------------------------------------------------- */
/**
 * Obtiene el estado del dispositivo desde status.json.
 *
 * @returns {Promise<Object|null>}
 */
async function fetchSystemStatus() {
  try {
    const res = await fetch(STATUS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.info('[Monli Kiosk] Estado del sistema recibido.', data);
    return data;
  } catch (error) {
    console.warn('[Monli Kiosk] status.json no disponible todavía:', error.message);
    return null;
  }
}

/* --------------------------------------------------------------------------
   Render (placeholder de Fase 1)
   -------------------------------------------------------------------------- */
async function render() {
  setLastUpdate();

  const [dolibarr, status] = await Promise.all([
    fetchDolibarrData(),
    fetchSystemStatus(),
  ]);

  // Los KPIs y tablas se conectarán a datos reales en la Fase 2.
  void dolibarr;
  void status;
}

/* --------------------------------------------------------------------------
   Inicialización
   -------------------------------------------------------------------------- */
function init() {
  console.log('%c🍋 Monli Kiosk', 'color:#76CCB6;font-weight:bold;font-size:14px;', 'inicializado.');
  console.log('[Monli Kiosk] Fase 1 — scaffolding. Esperando integración de datos.');

  render();

  // Refresco periódico del dashboard (cada 60 s).
  const REFRESH_MS = 60_000;
  setInterval(render, REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', init);

/* Exposición para depuración desde la consola. */
window.MonliKiosk = { init, render, fetchDolibarrData, fetchSystemStatus };
