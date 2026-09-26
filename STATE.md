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

## Historial de fases

| Fase | Descripción                                          | Estado        |
|------|------------------------------------------------------|---------------|
| 1    | Scaffolding e inicialización del frontend            | ✅ Completada |
| 2    | Integración API REST de Dolibarr + Chart.js + carrusel + Nginx | ✅ Completada |
| 3    | Integración `status.json` de la Orange Pi            | ✅ Completada (dentro de la Fase 2) |
| 4    | Modo Kiosk, autoarranque del navegador y cierre       | Pendiente     |

---

## Notas

- El backend (Dolibarr) está cerrado y operativo.
- El acceso a la API se realiza con la cabecera `DOLAPIKEY`.
- **Datos actuales:** la BBDD migrada de Dolibarr contiene **3 terceros y 1
  cliente**, pero **0 pedidos y 0 facturas**. El dashboard muestra por tanto
  importes a `0,00 €` y el estado vacío en la tabla de pedidos. La integración
  es correcta; basta con que Dolibarr registre pedidos/facturas para que los
  KPIs y gráficos se rellenen automáticamente.

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

- **Fase 4:** modo kiosco en la Orange Pi (Chromium `--kiosk` apuntando a
  `http://127.0.0.1:8080`, autostart, ocultar cursor/pantalla en blanco).
- Versionar el Server Block de Nginx del backend en `monli-barr` para
  reproducibilidad.
- Opcional: cargar datos de demostración en Dolibarr para validar la
  visualización de gráficos y tabla con importes reales.
