# Monli Kiosk — Especificación de Arquitectura (OpenSpec)

> ⚠️ **REGLA DE SEGURIDAD (PRIORIDAD MÁXIMA): BAJO NINGÚN CONCEPTO el agente desactivará el modo Coming Soon / Mantenimiento de WooCommerce, ni abrirá la tienda al público, a menos que el usuario utilice la palabra 'LANZAMIENTO OFICIAL' en su prompt.**

**Proyecto:** Monli Kiosk
**Tipo:** Aplicación SPA ligera para pantalla/Kiosko
**Versión del documento:** 1.0
**Fecha:** 28/09/2026
**Estado:** v1.0 — Auditoría final. Dashboard **100 % headless**, servido por **Nginx** y accesible vía **Tailscale**.

---

## 1. Propósito

Dashboard de visualización para el negocio **Monli Limón** pensado para
ejecutarse de forma continua ("Kiosk mode") en una **Orange Pi** con pantalla
dedicada. Muestra de un vistazo el estado comercial (KPIs de ventas, pedidos y
facturas de Dolibarr) y el estado del propio dispositivo.

El objetivo de esta especificación es fijar las decisiones técnicas del
frontend antes de desarrollar cada funcionalidad, evitando retrabajos y
contradicciones.

---

## 2. Principios de diseño técnico

- **Rendimiento ante todo:** pensado para hardware modesto (Orange Pi) y
  ejecución ininterrumpida. Se minimiza el consumo de CPU y memoria.
- **App SPA ligera:** HTML5 + CSS3 + **Vanilla JS**.
- **Sin frameworks pesados:** no se usan React, Vue, Angular ni bundlers.
  Se prioriza el arranque instantáneo y la ausencia de dependencias.
- **Sin build step:** los archivos se sirven directamente como estáticos.
- **Degradación elegante:** si una fuente de datos falla, el dashboard debe
  seguir mostrándose y señalizar el error en pantalla en lugar de romperse.
- **Seguridad de credenciales:** las claves/URLs sensibles viven en `config.js`,
  que **nunca** se versiona.

---

## 3. Stack

| Capa            | Tecnología                          |
|-----------------|-------------------------------------|
| Marcado         | HTML5 semántico                     |
| Estilos         | CSS3 (variables nativas, Grid, Flex)|
| Lógica          | JavaScript (ES2020+, módulo global) |
| Gráficos        | **Chart.js 4.4.4** (copia local en `assets/`) |
| Tipografía      | Google Fonts — **Quicksand**        |
| Datos remotos   | API REST de Dolibarr                |
| Estado del host | `status.json` de la Orange Pi       |

---

## 4. Fuentes de datos

### 4.1 API REST de Dolibarr

- **Base URL:** `DOLIBARR_API_URL` (ej. `http://100.88.140.37/api/index.php`).
- **Autenticación:** cabecera `DOLAPIKEY: <DOLIBARR_API_TOKEN>`.
- **Recurso principal:** pedidos y facturas.
  - `GET {DOLIBARR_API_URL}/orders` — pedidos.
  - `GET {DOLIBARR_API_URL}/invoices` — facturas.
- Requiere que Dolibarr tenga el módulo **API REST** activado y un token de
  usuario con permisos de lectura sobre pedidos/facturas.

### 4.2 `status.json` (Orange Pi)

- Documento JSON servido por la propia Orange Pi (ruta relativa `./status.json`).
- Informa del estado del dispositivo: temperatura, uso de CPU/RAM, uptime,
  conectividad, etc.
- Su esquema es flexible y se documentará al implementar la integración.

### 4.3 `sku_status.json` (auditoría de SKUs)

- Lo publica `monli-barr/scripts/sku_auditor.php` (cron de root cada 12 h) en el
  webroot del kiosco (ruta relativa `./sku_status.json`).
- Compara los SKUs de WooCommerce con las referencias **vendibles** de Dolibarr y
  expone `mismatch_count`, `missing_in_dolibarr`, `missing_in_wordpress`, etc.
- El Panel 3 muestra el badge «SKUs Tienda ↔ ERP» y el **banner global** avisa
  (Amarillo Limón) si hay desajustes. Si el fichero falta o trae error, no se
  alerta.

---

## 5. Estructura del proyecto

```
monli-kiosk/
├── OPENSPEC.md        # Este documento: arquitectura y decisiones
├── STATE.md           # Estado del proyecto y fases
├── index.html         # Estructura semántica del dashboard (carrusel)
├── style.css          # Estilos y variables de marca
├── app.js             # Lógica, integración de datos y carrusel
├── assets/            # Logos de marca y Chart.js local
├── config.example.js  # Plantilla de configuración (versionada)
└── config.js          # Configuración real con token (NO versionada)
```

---

## 6. Estructura del dashboard (`index.html`)

Layout de una sola pantalla organizado como **carrusel de 4 paneles**
conmutables automáticamente cada 15 s (pausable al mover el ratón o tocar la
pantalla):

1. **`<header>`** — logo Monli Limón, título del dashboard, badge de conexión
   y marca de última actualización.
2. **Panel 1 — Trimestre y finanzas:** KPIs de facturación (trimestre, mes,
   pedidos del trimestre, facturación pendiente) más el KPI **«Dinero en vuelo»**
   (pedidos del trimestre no cancelados y aún sin facturar, a ancho completo) y
   gráfico de barras Chart.js con la evolución mensual del trimestre (facturado
   vs. pendiente).
3. **Panel 2 — Pedidos en curso:** mini-KPIs y tabla de pedidos recientes
   (referencia, cliente, fecha, importe y estado de procesamiento).
4. **Panel 3 — Infraestructura & Web:** métricas de `status.json` (CPU, RAM,
   disco, temperatura), **línea de tendencia dual** (temperatura + CPU, últimas
   2 h desde `status.json → history`) y estado de servicios (API Dolibarr,
   `status.json`, puente WooCommerce Sync y backup con badge verde/rojo). El
   badge del puente refleja `status.json → bridge_status` (`OK`/`ERROR`),
   publicado por `observability.sh`. Incluye el badge **«SKUs Tienda ↔ ERP»**
   (`sku_status.json`, ver §4.3) y la tarjeta estática `panel--ga` con acceso
   directo a la interfaz web de Google Analytics.
5. **Panel 4 — Tráfico Web:** KPIs de GA4 (usuarios, sesiones, páginas vistas) y
   gráfico de líneas, alimentados por el proxy `analytics.json`
   (`monli-barr/scripts/fetch_ga4.py`). Si faltan datos ⇒ **estado vacío
   elegante**; nunca se inyectan datos falsos.
6. **`<footer>`** — navegación del carrusel (4 puntos, flechas y estado
   pausa/activo) y barra de progreso, más el banner global de alertas.

---

## 7. Sistema visual (Guía de Marca Monli Limón)

### 7.1 Tipografía

- Fuente principal: **Quicksand** (Google Fonts), importada vía `@import` en
  `style.css` y precargada en `index.html`.
- Pesos usados: 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold).

### 7.2 Paleta (variables CSS)

| Variable        | Nombre         | HEX       | Rol                       |
|-----------------|----------------|-----------|---------------------------|
| `--menta`       | Menta Monli    | `#76CCB6` | Color principal de marca  |
| `--azul-pizarra`| Azul Pizarra   | `#55607A` | Textos, iconografía, UI   |
| `--nube`        | Nube           | `#FFFDF8` | Fondo principal           |
| `--blanco`      | Blanco         | `#FFFFFF` | Superficies / tarjetas    |
| `--amarillo`    | Amarillo Limón | `#F1D077` | Acento / puntos de interés|

Colores de apoyo disponibles en la guía: Rosa Coral `#FF8FA3`, Melocotón
`#FFBFA3`, Lila Monli `#D9B4EE`, Aqua Limpio `#BDEDF5`, Verde Hoja `#74A77A`,
Ocre Miel `#C99A4A`.

### 7.3 Reglas de interfaz

- Estética **minimalista**, con mucho aire (espaciado generoso).
- **Esquinas redondeadas** en tarjetas, botones y contenedores.
- Fondo claro (Nube/Blanco) y texto en Azul Pizarra (nunca negro puro).
- La Menta se reserva para elementos principales/estructurales; el Amarillo
  Limón para acentos puntuales.

---

## 8. Seguridad

- `config.js` contiene `DOLIBARR_API_URL` y `DOLIBARR_API_TOKEN` y está
  incluido en `.gitignore`.
- `config.example.js` es la plantilla versionada, **sin credenciales reales**.
- Ningún token ni URL privada debe aparecer en `index.html`, `app.js`,
  `OPENSPEC.md`, `STATE.md` ni en el historial de git.

---

## 9. Google Analytics 4 (decisión)

**¿Se pueden consumir métricas de GA4 (usuarios activos) desde el navegador sin
OAuth ni cuenta de servicio?** **No.** La *Google Analytics Data API* exige
autenticación (OAuth2 de usuario o *service account* con acceso a la propiedad)
y firma del lado servidor; no existe endpoint público anónimo. Además, embeber
el panel de GA4 en un `<iframe>` falla por `X-Frame-Options`/CSP y porque
requiere sesión interactiva de Google.

**Decisión (Fase 7):** en el **Panel 3** se muestra una sección estática (`panel--ga`)
que documenta la limitación, identifica la propiedad (`556138617`) y el flujo
(`G-563BSRVELH`), y ofrece un enlace directo
(`https://analytics.google.com/.../p556138617/...`) para consultar GA4 en la web.

**Implementación (Fase 10):** la mejora futura ya está desplegada. Un proxy en la
Orange Pi (`monli-barr/scripts/fetch_ga4.py`) usa la cuenta de servicio de
Google (`/opt/monli/ga4_credentials.json`, `root:root 600`) para consultar la
GA4 Data API y publicar un JSON propio en el webroot del kiosco
(`/var/www/monli-kiosk/analytics.json`, `www-data:www-data 644`). El cron de
`root` lo ejecuta cada hora (`0 * * * *`). El **Panel 4 «Tráfico Web»** consume
ese fichero mediante `fetchAnalyticsData()` (`./analytics.json`), sin exponer
credenciales al frontend. Si el fichero **falta, falla o viene a cero**, el Panel 4
muestra un **estado vacío elegante** («Esperando recolección de datos...», badge
«Esperando datos»). **Nunca se inyectan datos falsos** (no existe mock en el
código). El diseño sin dependencias pesadas (JWT RS256 firmado con `openssl` +
`curl`) es el más estable en Armbian. Detalle en `monli-barr/scripts/README.md`.

La sección estática del Panel 3 (`panel--ga`) se conserva como acceso directo a
la interfaz web de GA4.

---

## 10. Despliegue 100 % headless (Tailscale + Nginx)

- **Servidor:** Orange Pi PC Plus (Armbian), **sin servidor gráfico local**: Xorg,
  Chromium, `unclutter` y `startx` están desactivados (`monli-kiosk.service` →
  `disabled` + `inactive`). El modo kiosco gráfico queda como artefacto
  versionado en `kiosk/`, reactivable si se instala disipador.
- **Nginx:** sirve el frontend estático en el puerto **8080**
  (`root /var/www/monli-kiosk`), más `status.json` y `analytics.json` desde el
  mismo origen. Dolibarr se sirve aparte por Nginx en el puerto 80.
- **Tailscale:** acceso seguro a través de **CGNAT** sin abrir puertos; IP fija
  `100.88.140.37` (DNS `monli-barr.tailb50aad.ts.net`). No hay exposición pública
  del kiosco.
- **Consumo:** al no ejecutar entorno gráfico, la placa baja su temperatura en
  reposo (~50–55 °C) y libera RAM/CPU para Dolibarr y el proxy GA4.
- **Sin datos falsos:** las únicas fuentes del dashboard son la API REST de
  Dolibarr, `status.json` y `analytics.json`; cualquier ausencia de datos se
  refleja como estado vacío o badge de error.
