# Monli Kiosk — Estado del Proyecto

**Última actualización:** 27/09/2026

---

## Fase actual

### Fase 2 — Integración Dolibarr, Chart.js, carrusel y despliegue Nginx

**Estado:** ✅ Completada (26/09/2026)

**Objetivos de la fase:**

- Integrar la API REST de Dolibarr (`/orders`, `/invoices`, `/thirdparties`)
  usando el token de `config.js`.
- Calcular KPIs y totales del trimestre actual.
- Añadir gráficos con Chart.js (ventas trimestrales y uso de recursos).
- Estructurar el dashboard en 3 paneles conmutables en modo carrusel
  automático (15 s, pausable al pasar el ratón o tocar la pantalla).
- Integrar `status.json` (CPU, RAM, disco, temperatura y estado del backup).
- Desplegar el frontend en el Nginx de la Orange Pi (puerto **8080**).

**Entregables:**

- [x] `index.html` — 3 paneles (finanzas / pedidos / infraestructura),
      navegación por puntos, flechas y teclado.
- [x] `style.css` — transiciones suaves entre paneles, tarjetas con bordes
      redondeados y sombras, tipografía Quicksand y paleta de marca.
- [x] `app.js` — integración Dolibarr, cálculos del trimestre, Chart.js,
      carrusel y manejo de errores (banner + badges de estado).
- [x] `assets/chart.umd.min.js` — Chart.js 4.4.4 vendido localmente
      (funciona sin conexión a Internet).
- [x] `config.js` desplegado en la Orange Pi (`www-data:www-data`, no versionado).
- [x] Server Block Nginx `/etc/nginx/sites-available/monli-kiosk`
      escuchando en el **puerto 8080**, `root /var/www/monli-kiosk`.

**Despliegue:**

| Elemento            | Valor                                                        |
|---------------------|--------------------------------------------------------------|
| URL del kiosco      | `http://100.88.140.37:8080`                                  |
| Webroot             | `/var/www/monli-kiosk` (`www-data:www-data`)                 |
| Server Block        | `/etc/nginx/sites-available/monli-kiosk` → `sites-enabled`   |
| Puerto              | **8080**                                                     |
| `status.json`       | alias local desde `/var/www/monli-barr/htdocs/status.json`   |
| Logs                | `/var/log/nginx/monli-kiosk.{access,error}.log`              |

---

### Fase 3 — Datos de demostración (con rollback) y versionado de Nginx

**Estado:** ✅ Completada (26/09/2026)

**Objetivos de la fase:**

- Cargar datos de demostración en Dolibarr para validar KPIs, gráficos y
  tabla de pedidos con importes reales.
- Disponer de un script de rollback que elimine sólo esos datos.
- Versionar los Server Blocks de Nginx de ambos repositorios.

**Entregables:**

- [x] 3 pedidos de cliente ficticios (`DEMO-CO2607-0001` 150 €,
      `DEMO-CO2608-0002` 320 € y `DEMO-CO2609-0003` 85 €), con fechas del
      trimestre actual (jul/ago/sep 2026) y sus líneas de detalle.
- [x] 2 facturas asociadas (`DEMO-FA2607-0001` 150 € — pendiente,
      `DEMO-FA2608-0002` 320 € — pagada), enlazadas a sus pedidos
      (`llx_element_element`) y con líneas de detalle.
- [x] `/opt/monli/scripts/clean_demo_data.sh` (Orange Pi, `diego:diego 755`)
      y `monli-barr/scripts/clean_demo_data.sh` (versionado): borra en una
      transacción sólo los registros con `ref LIKE 'DEMO-%'` (enlaces, líneas
      y cabeceras de pedido/factura) y verifica que no queda ninguno.
- [x] `monli-kiosk/nginx/monli-kiosk.conf` y `monli-barr/nginx/monli-barr.conf`:
      copias versionadas de los Server Blocks en producción.
- [x] **Corrección de frontend:** la API REST de Dolibarr devuelve la fecha de
      las facturas como `date` (no `datef`), por lo que el filtro del trimestre
      descartaba todas y el gráfico quedaba vacío. `app.js` ahora usa
      `invoiceDate()` con fallback `datef ?? date`.

---

### Fase 4 — Modo kiosco (autostart de Chromium)

**Estado:** ✅ Completada (26/09/2026)

**Entregables:**

- [x] Paquetes de interfaz gráfica y navegador instalados en la Orange Pi:
      `xorg`, `xinit`, `chromium` (equivalente Debian del `chromium-browser`
      indicado en el enunciado), `unclutter` y `xserver-xorg-legacy`.
- [x] **Arranque de X sin root:** `xserver-xorg-legacy` + `/etc/X11/Xwrapper.config`
      (`allowed_users=anybody`, `needs_root_rights=yes`). Sin el wrapper setuid
      (`Xorg.wrap`), Xorg fallaba con `Cannot open virtual console 1 (Permission
      denied)` al no poder `diego` abrir `/dev/tty1`.
- [x] `/opt/monli/scripts/start_kiosk.sh`: oculta el puntero
      (`unclutter -idle 0.1 -root`), desactiva el salvapantallas/DPMS
      (`xset s off`, `xset -dpms`) y lanza Chromium a pantalla completa
      (`--kiosk --noerrdialogs --disable-infobars
      --check-for-update-interval=31536000`) apuntando a
      `http://127.0.0.1:8080`. Se añaden `--use-gl=angle --use-angle=swiftshader
      --enable-unsafe-swiftshader --disable-gpu-compositing` porque la Mali de
      la Orange Pi no ofrece GLES y Chromium abortaba con `GPU process isn't
      usable`, además de `--disable-dev-shm-usage` (solo 1 GB de RAM).
- [x] `monli-kiosk.service` (systemd): arranca `startx` sobre `/dev/tty1` como
      el usuario `diego`, con `Restart=always` (el kiosco se relanza si Chromium
      o X terminan) y queda habilitado en `multi-user.target` para arrancar
      automáticamente con servidor gráfico local. Versionado en
      `monli-kiosk/kiosk/`.

**Despliegue:**

| Elemento            | Valor                                                         |
|---------------------|---------------------------------------------------------------|
| Script de arranque  | `/opt/monli/scripts/start_kiosk.sh` (`diego:diego 755`)       |
| Servicio systemd    | `/etc/systemd/system/monli-kiosk.service` (habilitado)        |
| TTY / servidor X    | `/dev/tty1` (`startx` → Xorg local)                           |
| Navegador           | `chromium --kiosk` → `http://127.0.0.1:8080`                  |
| Limpieza demo       | `/opt/monli/scripts/clean_demo_data.sh` (`diego:diego 755`)   |

---

### Fase 5 — Alertas visuales, gráfico de tendencias y protección térmica

**Estado:** ✅ Completada (26/09/2026)

**Objetivos de la fase:**

- Mostrar de un vistazo estados de alerta en los KPI de infraestructura.
- Dibujar la evolución temporal (2 h) de temperatura y CPU usando el nuevo
  array `history` de `status.json`.
- Proteger la Orange Pi (sin disipador físico) deteniendo el kiosco local.

**Entregables:**

- [x] `style.css` — nuevas clases de alerta en las tarjetas:
      `.kpi-card.warning` (borde y acento en Amarillo Limón `#F1D077`) y
      `.kpi-card.danger` (borde y acento en Rosa Coral `#FF8FA3` + badge
      `⚠ Aviso`).
- [x] `app.js` — reglas dinámicas y umbrales documentados (`ALERT_RULES`):
      temperatura `≥80 °C → danger`, `≥70 °C → warning`; CPU/RAM/Disco
      `≥85 % → danger`, `≥70 % → warning`. Se aplican con `applyKpiAlert()`
      y se limpian cuando no hay datos.
- [x] `index.html` + `app.js` — el Panel 3 sustituye el gráfico de barras
      «Uso de recursos» por una **línea de tendencia dual** Chart.js
      (`#chart-trend`, eje izquierdo °C / derecho %): temperatura y CPU de
      las últimas 2 h a partir de `status.json → history` (máx. 24 puntos).
- [x] Frontend desplegado en la Orange Pi (`/var/www/monli-kiosk`,
      `www-data:www-data`), hashes `md5sum` verificados. Servido por HTTP 200
      en `http://100.88.140.37:8080`.
- [x] **Protección térmica temporal:** `monli-kiosk.service` detenido
      (`systemctl stop`, estado `inactive`) y **conservado `enabled`** para
      el futuro. Sin procesos Xorg/Chromium activos.

**Nota:** el histórico lo genera `observability.sh` (ver `monli-barr`, Fase 10)
cada 5 min en `/opt/monli/status_history.tsv`; los valores instantáneos siguen
disponibles en las claves `cpu`/`memory`/`disk`/`temperature_celsius`.

---

### Fase 6 — Desactivación definitiva del kiosco local (servidor 100% headless)

**Estado:** ✅ Completada (27/09/2026)

**Objetivos de la fase:**

- Convertir la Orange Pi en un **servidor headless**: sin servidor gráfico local,
  sin navegador y sin puntero, dedicado a servir el backend Dolibarr y el
  dashboard por Nginx.
- Minimizar el consumo y la temperatura de la placa (sin disipador físico).

**Entregables:**

- [x] `sudo systemctl disable --now monli-kiosk.service` ejecutado. El servicio
      quedó **`disabled` + `inactive`** de forma permanente (ya no arranca con
      el sistema). Xorg, Chromium, `startx` y `unclutter` **no están en
      ejecución** (`ps aux | grep -E 'chromium|Xorg|unclutter|startx'` → vacío).
- [x] El dashboard sigue **plenamente accesible vía Nginx**:
      `http://100.88.140.37:8080/` → `HTTP 200`. El backend
      (`http://100.88.140.37/`) y `status.json` → `HTTP 200`.
- [x] **Temperatura estable ~50–55 °C** en reposo (antes, con el kiosco
      arrancado, oscilaba entre 55 y 80 °C; la Fase 5 llegó a registrar 73,6 °C
      de pico). El descenso se confirma en `status.json → history`.

**Despliegue:**

| Elemento            | Valor                                                         |
|---------------------|---------------------------------------------------------------|
| Servicio systemd    | `monli-kiosk.service` → **disabled + inactive**               |
| Procesos gráficos   | Ninguno (Xorg/Chromium/unclutter detenidos)                   |
| Dashboard           | `http://100.88.140.37:8080` (Nginx, `HTTP 200`)               |
| Reactivación        | `sudo systemctl enable --now monli-kiosk.service`             |

**Nota:** los artefactos del kiosco (`start_kiosk.sh` y `monli-kiosk.service`)
se conservan versionados en `monli-kiosk/kiosk/` por si en el futuro se instala
disipador y se quiere recuperar el modo pantalla.

---

### Fase 7 — Sección de Google Analytics 4 en el Panel 3

**Estado:** ✅ Completada (27/09/2026)

**Objetivos de la fase:**

- Determinar si el dashboard puede consumir métricas de GA4 (usuarios activos)
  sin OAuth ni cuenta de servicio en el backend.
- Si no es posible, ofrecer en el Panel 3 un acceso/documentación a GA4 sin
  bloquear el dashboard.

**Hallazgo:** **No es posible.** La *Google Analytics Data API* requiere OAuth2
o *service account* con acceso a la propiedad; no hay endpoint anónimo. Embeber
GA4 en un `iframe` también falla (`X-Frame-Options`/CSP + sesión interactiva).

**Entregables:**

- [x] `index.html` — nueva tarjeta `panel--ga` en el **Panel 3** con la
      limitación, las etiquetas de propiedad (`556138617`) y flujo
      (`G-563BSRVELH`), y un enlace a *Google Analytics Dashboard*
      (`https://analytics.google.com/analytics/web/#/p556138617/reports/reportinghub`).
- [x] `style.css` — estilos `.panel--ga` / `.ga-panel` (paleta de marca).
- [x] `OPENSPEC.md` §9 — decisión técnica y vía futura (proxy con cuenta de
      servicio que publique un `ga.json`, análogo a `status.json`).
- [x] Frontend desplegado en la Orange Pi (`/var/www/monli-kiosk`, `www-data`
      `644`) con `HTTP 200` en `http://100.88.140.37:8080`.

---

## Historial de fases

| Fase | Descripción                                          | Estado        |
|------|------------------------------------------------------|---------------|
| 1    | Scaffolding e inicialización del frontend            | ✅ Completada |
| 2    | Integración API REST de Dolibarr + Chart.js + carrusel + Nginx | ✅ Completada |
| —    | Integración `status.json` de la Orange Pi            | ✅ Completada (dentro de la Fase 2) |
| 3    | Datos de demostración + rollback + versionado de Nginx | ✅ Completada |
| 4    | Modo Kiosk, autoarranque del navegador y cierre       | ✅ Completada |
| 5    | Alertas visuales, gráfico de tendencias (2 h) y protección térmica | ✅ Completada |
| 6    | Desactivación definitiva del kiosco local (servidor 100% headless) | ✅ Completada |
| 7    | Sección de Google Analytics 4 en el Panel 3                     | ✅ Completada |

---

## Notas

- El backend (Dolibarr) está cerrado y operativo.
- El acceso a la API se realiza con la cabecera `DOLAPIKEY`.
- **Datos actuales:** la BBDD de Dolibarr contiene **3 terceros y 1 cliente**.
  Los **datos de demostración** de la Fase 3 (3 pedidos y 2 facturas `DEMO-`)
  fueron **eliminados** el 26/09/2026 con `clean_demo_data.sh`; no queda ningún
  registro `DEMO-` ni líneas/enlaces huérfanos.

### Correcciones aplicadas en el backend (Orange Pi) durante la Fase 2

Para que la API REST fuese realmente accesible desde el frontend fue necesario
corregir dos puntos del backend que no formaban parte del código del kiosco:

1. **Nginx de `monli-barr` (PATH_INFO de la API REST).** La directiva
   `location ~ \.php$` solo casaba con URLs terminadas en `.php`, por lo que
   `/api/index.php/orders`, `/invoices`, etc. caían al `try_files` general y
   devolvían el HTML del login de Dolibarr. Se cambió a
   `location ~ \.php(/|$)` (con el `snippets/fastcgi-php.conf` que ya reparte
   `PATH_INFO`). Respaldo en `/etc/nginx/sites-available/monli-barr.pre-api-fix.bak`.
   Verificado: `/api/index.php/orders` → `200 application/json`.
2. **Permiso del usuario API `kiosko`.** El recurso `/thirdparties` devolvía
   `404 Thirdparties not found` porque el usuario carecía del derecho
   *Leer todos los terceros* (id `262` en `llx_rights_def`), lo que forzaba el
   filtro por comercial asignado y dejaba la lista vacía. Se añadió el derecho
   `societe/client/voir` (262) al usuario `kiosko` en `llx_user_rights`.

Ambos cambios son de solo lectura y no alteran datos de negocio.

### Próximos pasos sugeridos

- **Orange Pi 100 % headless.** El dashboard se sirve en
  `http://100.88.140.37:8080` (y en local `http://127.0.0.1:8080`) a través de
  Nginx, pero el kiosco gráfico local está **desactivado de forma permanente**
  (`monli-kiosk.service` → `disabled` + `inactive`, sin Xorg/Chromium). El
  servicio se conserva versionado en `monli-kiosk/kiosk/` y puede reactivarse
  con `sudo systemctl enable --now monli-kiosk.service` si se instala disipador.
- Retirar los datos de demostración cuando ya no sean necesarios:
  `sudo /opt/monli/scripts/clean_demo_data.sh` (necesita leer
  `/opt/monli/.env`). **Ya ejecutado.**
- **Alertas y tendencias implementadas:** badges `.warning`/`.danger` por
  umbral y gráfico de línea de temperatura+CPU (2 h) alimentado por
  `status.json → history`.
- Versionar futuras modificaciones de los Server Blocks a partir de
  `monli-kiosk/nginx/monli-kiosk.conf` y `monli-barr/nginx/monli-barr.conf`.
