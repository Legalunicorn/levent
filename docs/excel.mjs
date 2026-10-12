import { COLUMNS, emptyState, importCSV, validateState } from './core.mjs';

// Identify Excel by its ZIP signature, not the filename supplied by Files/Safari.
export async function importGuestFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return importExcel(buffer);
  if (/\.xlsx?$/i.test(file.name.trim()) || /\.xlxs$/i.test(file.name.trim())) {
    throw new Error('This file is not a readable .xlsx workbook. Select the original Attendance List.xlsx file.');
  }
  if (/\.csv$/i.test(file.name.trim())) return importCSV(new TextDecoder().decode(buffer));
  throw new Error('Select the original Attendance List.xlsx file, or a CSV export.');
}

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
  const fields = Object.entries(COLUMNS).slice(0, 9);
  const headers = rows.shift() || [];
  if (fields.some(([, header], i) => String(headers[i] ?? '').trim() !== header)) {
    throw new Error('The guest headers in row 4 do not match the original Attendance List.xlsx template.');
  }
  const guests = rows.filter(row => row.some(value => String(value).trim())).map(row => ({
    ...Object.fromEntries(fields.map(([field], i) => [field, String(row[i] ?? '')])),
    notes: '', id: crypto.randomUUID(),
  }));
  if (!guests.length) throw new Error('No guests were found below row 4 in Event Registration.');
  // Excel cell values go straight to validation; they are never parsed as CSV.
  return validateState({ ...emptyState(), guests });
}
