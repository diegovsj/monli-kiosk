# Monli Kiosk — Especificación de Arquitectura (OpenSpec)

**Proyecto:** Monli Kiosk
**Tipo:** Aplicación SPA ligera para pantalla/Kiosko
**Versión del documento:** 0.1
**Fecha:** 26/09/2026
**Estado:** Fase 1 — Scaffolding e inicialización del frontend

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

---

## 5. Estructura del proyecto

```
monli-kiosk/
├── OPENSPEC.md        # Este documento: arquitectura y decisiones
├── STATE.md           # Estado del proyecto y fases
├── index.html         # Estructura semántica del dashboard
├── style.css          # Estilos y variables de marca
├── app.js             # Lógica e inicialización
├── config.example.js  # Plantilla de configuración (versionada)
└── config.js          # Configuración real con token (NO versionada)
```

---

## 6. Estructura del dashboard (`index.html`)

Layout semántico de una sola pantalla:

1. **`<header>`** — logo Monli Limón y título del dashboard.
2. **Grid de KPIs** (`<section>` con grid) — métricas de ventas:
   ventas de hoy, ventas del mes, pedidos pendientes, facturación pendiente.
3. **Pedidos recientes** (`<section>`) — listado/tabla de los últimos pedidos.
4. **Estado Orange Pi** (`<aside>` / `<footer>`) — salud del dispositivo.

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
