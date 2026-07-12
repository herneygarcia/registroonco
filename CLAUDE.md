# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**RegistroOnco** — voice-based patient registry web app for genitourinary oncology, deployed at `herneygarcia.github.io/registroonco`. Pure static HTML/JS/CSS, no build step. Open `index.html` directly in Chrome to run locally.

## Structure

- **`js/`** — application logic: `templates.js` (data), `app.js` (runtime), `export.js` (Excel/CSV), `translations.js` (i18n)
- **`css/`** — `style.css` (all styling)
- **`assets/`** — `logo.png`, app icons (`icon-180.png`, `icon-192.png`, `icon-512.png`), `manifest.json` (PWA)
- **Root** — `index.html`, `CLAUDE.md`, `.git`

## Architecture

Three JS files loaded in order via `<script>` tags in `index.html`:

1. **`js/templates.js`** — all data definitions. `CAMPOS_COMUNES` (8 shared fields including `institucion`) is spread into every template. `PLANTILLAS` is a keyed object (`pene`, `prostata`, `vejiga`, `rinon`, `testiculo`, `ureter`, `adrenal`, `escroto`, `uretra`) where each entry has `{ nombre, cie10, color, campos[] }`. Field types: `text`, `number`, `date`, `select`, `boolean`, `textarea`.

2. **`js/export.js`** — `exportarExcel()` and `exportarCSV()`. Uses SheetJS loaded from CDN. Groups records by `_patologia` key and uses template field labels as column headers.

3. **`js/app.js`** — all runtime logic. Global `estado` object holds current state. Key flows:
   - **Persistence**: `localStorage` keys `registroOnco_datos`, `registroOnco_apikey`, `registroOnco_proveedor`, `registroOnco_driveurl`
   - **Form**: `renderizarFormulario(datosExtraidos?)` generates fields dynamically from `PLANTILLAS[estado.patologiaActual].campos`
   - **Voice**: Web Speech API (`es-CO`), Chrome only. Records to `estado.transcripcion`, then user triggers AI extraction
   - **AI extraction**: `extraerCampos()` → builds prompt with field IDs and valid options → calls Gemini / Groq / Claude → parses JSON → calls `renderizarFormulario(extraido)`
   - **Drive sync (bidirectional)**: `subirAlDrive()` (POST) and `cargarDesdeDrive()` (GET) talk to a Google Apps Script web app

## Google Apps Script backend

URL stored in `DRIVE_URL_ACTUAL` in `app.js`. The script lives at `script.google.com` under project **RegistroOnco**.

- **doPost**: receives `{ registros[], camposPorPatologia }`. Upserts by `_id` — one sheet per pathology named after `plantilla.nombre`. Columns: `_id`, field labels from template.
- **doGet**: reads all sheets, returns `{ ok, registros[] }` where each record has `_hoja` (sheet name = pathology display name).

**Critical mapping**: Drive stores column headers as labels ("Nombre completo") but `app.js` uses field IDs ("nombre"). `cargarDesdeDrive()` builds a reverse map `labelAId` from `PLANTILLAS[patKey].campos` to convert on load. It also resolves pathology via `nombreAKey` (display name → internal key) using `_hoja` when `_patologia` is missing (older records).

Auto-migration: `obtenerDriveUrl()` detects `DRIVE_URL_ANTIGUA` in localStorage and replaces it with `DRIVE_URL_ACTUAL` automatically.

## Adding a new pathology

1. Add an entry to `PLANTILLAS` in `templates.js` with a unique key, `nombre`, `cie10`, `color`, and `campos` (always spread `...CAMPOS_COMUNES` first)
2. Add a `<button class="tumor-btn" data-id="KEY" onclick="seleccionarPatologia('KEY')">` in `index.html`

## Deploying changes

No CI. Use `git push origin main` to deploy (or upload changed files directly to `github.com/herneygarcia/registroonco` via the GitHub web UI, ensuring folder structure is preserved). GitHub Pages serves the `main` branch; changes go live in ~2 minutes.

When the Apps Script backend changes: go to `script.google.com` → project RegistroOnco → deploy → Administrar implementaciones → edit → Nueva versión → Actualizar. The `/exec` URL stays the same.
