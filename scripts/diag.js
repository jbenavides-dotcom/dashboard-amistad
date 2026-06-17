// Diagnóstico: lista pestañas (título + gid) y localiza dónde está "AMISTAD".
const fs = require('fs');
const { google } = require('googleapis');
const SHEET_ID = '1Mlkkg919mzOPv2mYM0Rv8Sgm6By7bURWTHW-JLrAvz8';

function norm(v){return String(v==null?'':v).toUpperCase().trim().replace(/\s+/g,' ');}

(async () => {
  const credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_SA_KEY_FILE,'utf8'));
  const auth = new google.auth.GoogleAuth({ credentials, scopes:['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version:'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields:'sheets.properties(sheetId,title)' });
  const tabs = meta.data.sheets.map(s => s.properties);
  console.log('PESTAÑAS:');
  tabs.forEach(t => console.log('  gid=' + t.sheetId + '  ::  ' + t.title));

  console.log('\nBUSCANDO "AMISTAD":');
  for (const t of tabs) {
    let resp;
    try {
      resp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: "'" + t.title + "'",
        valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
      });
    } catch (e) { continue; }
    const values = resp.data.values || [];
    let hits = [];
    for (let r = 0; r < values.length; r++) {
      for (let cI = 0; cI < (values[r]||[]).length; cI++) {
        if (norm(values[r][cI]).indexOf('AMISTAD') !== -1) hits.push('fila ' + (r+1) + ' col ' + (cI+1));
      }
    }
    if (hits.length) {
      console.log('  >>> "' + t.title + '" (gid=' + t.sheetId + ') tiene AMISTAD en: ' + hits.join(', '));
      // mostrar encabezado probable y la(s) fila(s)
      for (let r = 0; r < Math.min(values.length, 60); r++) {
        const cells = (values[r]||[]).map(norm);
        if (cells.indexOf('PROGRAMA') !== -1) { console.log('      header fila ' + (r+1) + ': ' + (values[r]||[]).join(' | ')); break; }
      }
      hits.slice(0,3).forEach(h => {
        const r = parseInt(h.split(' ')[1],10) - 1;
        console.log('      ' + (h) + ': ' + (values[r]||[]).join(' | '));
      });
    }
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
