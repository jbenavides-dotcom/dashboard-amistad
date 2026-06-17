# Dashboard — La Amistad (Avance vs Meta 2026)

Dashboard estático para **La Palma y el Tucán** que muestra el avance del programa de café
**La Amistad** (vecinos / CODECAFE COOPERATIVA) contra las metas 2026.

## Cómo funciona (Fuente → script → JSON → dashboard)

1. **Fuente:** hoja `La Amistad` (`gid=87525300`) de la Sheet PT 2026.
2. **Script:** `scripts/build-datos.js` lee la pestaña con un *service account* (solo lectura),
   filtra las filas del programa `LA AMISTAD` y suma kilos/sacos.
3. **JSON:** escribe `datos-amistad.json`.
4. **Dashboard:** `index.html` hace `fetch('./datos-amistad.json')` y dibuja las barras de avance.

El **GitHub Action** (`.github/workflows/actualizar-datos.yml`) corre cada hora (y a mano con
*Run workflow*), regenera el JSON y lo commitea. GitHub Pages sirve el `index.html`.

## Metas 2026

- Compra en pergamino: **18.000 kg**
- Producción en verde: **400 bultos de 35 kg** (14.000 kg, factor ≈78%)

Se editan en la constante `META` de `scripts/build-datos.js`.

## Configuración

- **Secret** `GOOGLE_SA_KEY_JSON`: el JSON del service account (Settings → Secrets and variables → Actions).
- La Sheet debe estar **compartida (lector)** con el email del service account.

## Prueba local

```bash
npm install
GOOGLE_SA_KEY_FILE="ruta/al/service-account-key.json" node scripts/build-datos.js
```
