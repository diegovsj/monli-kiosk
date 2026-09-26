# Monli Kiosk — Estado del Proyecto

**Última actualización:** 26/09/2026

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

## Historial de fases

| Fase | Descripción                                          | Estado        |
|------|------------------------------------------------------|---------------|
| 1    | Scaffolding e inicialización del frontend            | ✅ Completada |
| 2    | Integración API REST de Dolibarr + Chart.js + carrusel + Nginx | ✅ Completada |
| —    | Integración `status.json` de la Orange Pi            | ✅ Completada (dentro de la Fase 2) |
| 3    | Datos de demostración + rollback + versionado de Nginx | ✅ Completada |
| 4    | Modo Kiosk, autoarranque del navegador y cierre       | ✅ Completada |

---

## Notas

- El backend (Dolibarr) está cerrado y operativo.
- El acceso a la API se realiza con la cabecera `DOLAPIKEY`.
- **Datos actuales:** la BBDD de Dolibarr contiene **3 terceros y 1 cliente**,
  más **datos de demostración** de la Fase 3: **3 pedidos y 2 facturas** con
  prefijo `DEMO-` (150 € / 320 € / 85 €) fechados en el T3 2026, que permiten
  validar KPIs, gráfico de barras y tabla de pedidos. Se eliminan en cualquier
  momento con `clean_demo_data.sh`.

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

- **Kiosco desplegado y funcional.** El dashboard se sirve en
  `http://127.0.0.1:8080` y Chromium arranca a pantalla completa mediante
  `monli-kiosk.service`.
- Retirar los datos de demostración cuando ya no sean necesarios:
  `sudo /opt/monli/scripts/clean_demo_data.sh` (necesita leer
  `/opt/monli/.env`).
- Observar/endurecer el kiosco: `Restart=on-failure` ya reinicia Chromium si
  se cae; se pueden añadir alertas visuales por `temperature_celsius`,
  `disk.usage_percent` y `backup_status`.
- Versionar futuras modificaciones de los Server Blocks a partir de
  `monli-kiosk/nginx/monli-kiosk.conf` y `monli-barr/nginx/monli-barr.conf`.
