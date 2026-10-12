import { importCSV } from './core.mjs';

// Read the supplied attendance template, excluding the hotel totals in K–O.
export async function importExcel(buffer) {
  const XLSX = await import('./vendor/xlsx.mjs');
  let workbook;
  try { workbook = XLSX.read(buffer, { type: 'array', cellHTML: false, cellFormula: false }); }
  catch { throw new Error('Could not read this Excel file. Choose an unencrypted .xlsx workbook.'); }
  const sheet = workbook.Sheets['Event Registration'];
  if (!sheet) throw new Error('The Excel file needs a worksheet named “Event Registration”, with guest headers in row 4.');
  const lastRow = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r;
  if (lastRow > 10000) throw new Error('This worksheet is too large. Please use the event attendance workbook.');
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1, range: { s: { r: 3, c: 0 }, e: { r: Math.max(lastRow, 3), c: 8 } },
    raw: false, defval: '', blankrows: false,
  });
  const csv = rows.map(row => Array.from({ length: 9 }, (_, i) => '"' + String(row[i] ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
  return importCSV(csv);
}
