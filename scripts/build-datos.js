/**
 * build-datos.js — Genera datos-amistad.json leyendo la Sheet PT 2026.
 *
 * Fuente -> script -> JSON -> dashboard.
 * Encuentra la pestaña por su gid, ubica las columnas por nombre, filtra las
 * filas del programa "LA AMISTAD" y suma kilos/sacos. Las metas son constantes.
 *
 * Autenticación (service account, solo lectura):
 *   - En GitHub Actions: variable de entorno GOOGLE_SA_KEY_JSON (el JSON completo).
 *   - En local (prueba):  GOOGLE_SA_KEY_FILE=ruta\al\service-account-key.json
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// ===== CONFIG =====
const SHEET_ID = '1Mlkkg919mzOPv2mYM0Rv8Sgm6By7bURWTHW-JLrAvz8';
const GID = 948665575;           // pestaña "LA_AMISTAD" (inventario + salidas a lotes/trilla)
const PROGRAMA_FILTRO = 'AMISTAD';
const OUT = path.join(__dirname, '..', 'datos-amistad.json');

const META = {
  compra_pergamino_kg: 18000,
  bultos_verde: 400,
  kg_por_bulto: 35,
  rendimiento_pct: 78
};

// ===== Credenciales =====
function getCredentials() {
  if (process.env.GOOGLE_SA_KEY_JSON) {
    return JSON.parse(process.env.GOOGLE_SA_KEY_JSON);
  }
  if (process.env.GOOGLE_SA_KEY_FILE) {
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_SA_KEY_FILE, 'utf8'));
  }
  throw new Error('Falta GOOGLE_SA_KEY_JSON (Actions) o GOOGLE_SA_KEY_FILE (local).');
}

// ===== Helpers de parseo =====
function norm(v) {
  return String(v == null ? '' : v)
    .toUpperCase().trim().replace(/\s+/g, ' ')
    .replace(/[ÁÀÂ]/g, 'A').replace(/[ÉÈÊ]/g, 'E').replace(/[ÍÌ]/g, 'I')
    .replace(/[ÓÒÔ]/g, 'O').replace(/[ÚÙ]/g, 'U');
}
function str(v) { return v == null ? '' : String(v).trim(); }
function num(v) {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, '').replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// La pestaña tiene varias tablas lado a lado. Acotamos la lectura al BLOQUE de
// inventario (el contiguo que contiene PROGRAMA) para no mezclar columnas de las
// secciones de salidas/lotes/trilla que repiten encabezados (PROCESO, DISPONIBLE...).
function findHeaderRow(values) {
  for (let r = 0; r < values.length; r++) {
    const cells = (values[r] || []).map(norm);
    const progIdx = cells.indexOf('PROGRAMA');
    const hasKg = cells.some(x => x.indexOf('BRUTO') !== -1 || x.indexOf('DISPONIBLE') !== -1);
    if (progIdx !== -1 && hasKg) {
      let start = progIdx, end = progIdx;
      while (start > 0 && cells[start - 1] !== '') start--;
      while (end < cells.length - 1 && cells[end + 1] !== '') end++;
      // "Excelso entregado a Comercial" (verde) puede estar fuera del bloque, a la derecha.
      let excelsoIdx = -1;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].indexOf('EXCELSO ENTREGADO') !== -1) { excelsoIdx = i; break; }
      }
      return { row: r, progIdx, cols: mapCols(cells, start, end), excelsoIdx };
    }
  }
  return null;
}

function mapCols(cells, start, end) {
  const c = {};
  const dispCols = [];
  for (let i = start; i <= end; i++) {
    const h = cells[i];
    if (h === 'PROGRAMA') c.programa = i;
    else if (h.indexOf('BACHE') !== -1) c.bache = i;
    else if (h.indexOf('FECHA ENTRADA') !== -1) c.fecha = i;
    else if (h.indexOf('REMISION') !== -1) c.remision = i;
    else if (h.indexOf('PROVEEDOR') !== -1 || h.indexOf('CAFICULTOR') !== -1) c.proveedor = i;
    else if (h === 'PROCESO') c.proceso = i;
    else if (h.indexOf('VARIEDAD') !== -1) c.variedad = i;
    else if (h.indexOf('BRUTO') !== -1) c.brutos = i;
    else if (h.indexOf('SACO') !== -1) c.sacos = i;
    else if (h.indexOf('MUESTRA') !== -1) c.muestras = i;
    if (h === 'KG DISPONIBLES') c.disponible = i;
    if (h.indexOf('DISPONIBLE') !== -1) dispCols.push(i);
  }
  if (c.disponible == null && dispCols.length) c.disponible = dispCols[dispCols.length - 1];
  return c;
}

async function main() {
  const credentials = getCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // 1) Encontrar la pestaña por gid
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets.properties(sheetId,title)'
  });
  const tab = (meta.data.sheets || [])
    .map(s => s.properties)
    .find(p => p.sheetId === GID);
  if (!tab) throw new Error('No se encontró la pestaña gid=' + GID);

  // 2) Leer valores (números sin formato, fechas como texto)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'" + tab.title + "'",
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING'
  });
  const values = resp.data.values || [];

  // 3) Parsear
  const hdr = findHeaderRow(values);
  if (!hdr) throw new Error('No encontré la fila de encabezados (PROGRAMA + KG) en "' + tab.title + '".');
  const c = hdr.cols;

  const baches = [];
  const sum = { brutos: 0, disponible: 0, sacos: 0, muestras: 0 };
  let excelsoKg = 0;  // verde entregado (toda la pestaña es La Amistad)
  for (let r = hdr.row + 1; r < values.length; r++) {
    const row = values[r] || [];

    // Verde: sumar "Excelso entregado a Comercial" de cualquier fila de la trilla.
    if (hdr.excelsoIdx !== -1) excelsoKg += num(row[hdr.excelsoIdx]);

    // Inventario: solo filas cuyo PROGRAMA dice "AMISTAD".
    if (norm(row[c.programa]).indexOf(PROGRAMA_FILTRO) === -1) continue;
    const b = {
      bache: str(row[c.bache]),
      fecha_entrada: str(row[c.fecha]),
      remision: str(row[c.remision]),
      proveedor: str(row[c.proveedor]),
      proceso: str(row[c.proceso]),
      variedad: str(row[c.variedad]),
      kg_brutos: num(row[c.brutos]),
      kg_disponibles: num(row[c.disponible]),
      sacos: num(row[c.sacos]),
      muestras: num(row[c.muestras])
    };
    baches.push(b);
    sum.brutos += b.kg_brutos;
    sum.disponible += b.kg_disponibles;
    sum.sacos += b.sacos;
    sum.muestras += b.muestras;
  }
  const bultosVerde = excelsoKg / META.kg_por_bulto;

  const data = {
    programa: 'La Amistad',
    descripcion: 'Programa de vecinos (Mejores Vecinos) — café comprado a CODECAFE COOPERATIVA',
    actualizado: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    fuente: 'Sheet PT 2026 · gid=' + GID + ' (' + tab.title + ')',
    metas: {
      compra_pergamino_kg: META.compra_pergamino_kg,
      bultos_verde: META.bultos_verde,
      kg_por_bulto: META.kg_por_bulto,
      verde_kg: META.bultos_verde * META.kg_por_bulto,
      factor_rendimiento: +(100 / META.rendimiento_pct).toFixed(3),
      rendimiento_pct: META.rendimiento_pct
    },
    actual: {
      compra_pergamino_kg: sum.brutos,
      disponible_pergamino_kg: sum.disponible,
      bultos_verde: bultosVerde,
      verde_kg: excelsoKg,
      sacos: sum.sacos,
      muestras_kg: sum.muestras
    },
    baches
  };

  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('OK -> ' + OUT);
  console.log('Pestaña: "' + tab.title + '" | baches La Amistad: ' + baches.length +
    ' | compra: ' + sum.brutos + ' kg | disponible: ' + sum.disponible + ' kg' +
    ' | verde: ' + excelsoKg + ' kg (' + bultosVerde.toFixed(1) + ' bultos)');
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
