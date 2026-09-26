# Monli Kiosk — Estado del Proyecto

**Última actualización:** 26/09/2026

---

## Fase actual

### Fase 1 — Scaffolding e inicialización del frontend

**Estado:** En progreso

**Objetivos de la fase:**

- Definir la arquitectura del frontend (`OPENSPEC.md`).
- Configurar la seguridad del repositorio (`.gitignore` para `config.js`).
- Crear la estructura base: `index.html`, `style.css`, `app.js`.
- Crear la plantilla de configuración `config.example.js`.
- Aplicar la identidad visual de Monli Limón (Quicksand, Menta, Azul Pizarra,
  Nube, Amarillo Limón).

**Entregables:**

- [ ] `OPENSPEC.md`
- [ ] `STATE.md`
- [ ] `.gitignore`
- [ ] `config.example.js`
- [ ] `config.js` (local, no versionado)
- [ ] `index.html`
- [ ] `style.css`
- [ ] `app.js`

---

## Historial de fases

| Fase | Descripción                                  | Estado      |
|------|----------------------------------------------|-------------|
| 1    | Scaffolding e inicialización del frontend    | En progreso |
| 2    | Integración API REST de Dolibarr             | Pendiente   |
| 3    | Integración `status.json` de la Orange Pi    | Pendiente   |
| 4    | Modo Kiosk, autoarranque y despliegue        | Pendiente   |

---

## Notas

- El backend (Dolibarr) está cerrado y operativo.
- El acceso a la API se realiza con la cabecera `DOLAPIKEY`.
