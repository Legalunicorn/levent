import { COLUMNS, emptyState, importCSV, validateState, ATTENDANCE, ANSWERS } from './core.mjs';

const key = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
  name: ['Guest name', 'Full name'], company: ['Organisation', 'Organization'], title: ['Job title'],
  contact: ['Email address', 'Contact', 'Contact information', 'Email/contact information'],
  attendance: ['Attendance status'], starter: ['Starter', 'Lunch starter'], main: ['Main', 'Lunch main', 'Main course'],
  parking: ['Parking coupon', 'Parking'], taxi: ['Taxi reimbursement', 'Reimbursement'], notes: ['Note'],
};
const fields = Object.keys(COLUMNS).filter(field => field !== 'id');

export async function importGuestFile(file) {
  const buffer = await file.arrayBuffer(), bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return importExcel(buffer);
  if (/\.(xlsx?|xlxs)$/i.test(file.name.trim())) throw new Error('This file is not a readable Excel workbook. Save it as .xlsx and try again.');
  if (/\.csv$/i.test(file.name.trim())) return importCSV(new TextDecoder().decode(buffer));
  throw new Error('Choose an Excel (.xlsx) or CSV file.');
}

export async function importExcel(buffer) {
  let XLSX;
  try { XLSX = await import('./vendor/xlsx.mjs'); }
  catch { throw new Error('The Excel reader could not load. Reconnect to the internet, reload this page, and try again.'); }
  let workbook;
  try { workbook = XLSX.read(buffer, { type: 'array', cellHTML: false, cellFormula: false }); }
  catch { throw new Error('Could not read this Excel file. Choose an unencrypted .xlsx workbook.'); }
  let table;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName], headerRows = new Map();
    for (const address of Object.keys(sheet)) {
      if (address.startsWith('!')) continue;
      const { r, c } = XLSX.utils.decode_cell(address);
      if (r >= 100 || sheet[address].v == null) continue;
      if (!headerRows.has(r)) headerRows.set(r, new Map());
      headerRows.get(r).set(c, key(sheet[address].v));
    }
    for (const [row, headers] of headerRows) {
      const columns = {};
      for (const field of fields) {
        const match = [...headers].find(([, value]) => value === key(COLUMNS[field]))
          || [...headers].find(([, value]) => (aliases[field] || []).some(alias => key(alias) === value));
        if (match) columns[field] = match[0];
      }
      const score = Object.keys(columns).length;
      if (columns.name !== undefined && (!table || score > table.score)) table = { sheet, sheetName, row, columns, score };
    }
  }
  if (!table) throw new Error('Could not find a Name or Guest name heading near the top of a worksheet. Extra columns are fine.');
  const { sheet, sheetName, row: headerRow, columns } = table;
  const rows = new Set(), usedColumns = new Set(Object.values(columns));
  for (const address of Object.keys(sheet)) {
    if (address.startsWith('!')) continue;
    const { r, c } = XLSX.utils.decode_cell(address);
    if (r > headerRow && usedColumns.has(c) && String(sheet[address].v ?? '').trim()) rows.add(r);
  }
  if (rows.size > 10000) throw new Error('Please use a list with fewer than 10,000 guest rows.');
  const result = emptyState();
  const read = (row, field) => {
    if (columns[field] === undefined) return '';
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: columns[field] })];
    return cell?.v == null ? '' : String(typeof cell.v === 'string' ? cell.v : cell.w ?? cell.v);
  };
  for (const row of [...rows].sort((a, b) => a - b)) {
    const guest = Object.fromEntries(fields.map(field => [field, read(row, field)]));
    if (Object.keys(columns).every(field => key(guest[field]) === key(read(headerRow, field)))) continue;
    if (!guest.name.trim()) throw new Error(`${sheetName}, row ${row + 1}: a guest has details but no name. Add their name and import again.`);
    for (const [field, values] of [['attendance', ATTENDANCE], ['parking', ANSWERS], ['taxi', ANSWERS], ['starter', Object.keys(result.limits.starter)], ['main', Object.keys(result.limits.main)]]) {
      const value = guest[field].trim();
      if (['starter', 'main'].includes(field) && ['notselected', 'none', 'na'].includes(key(value))) { guest[field] = ''; continue; }
      const answer = ['parking', 'taxi'].includes(field) ? { true: 'Yes', false: 'No', y: 'Yes', n: 'No' }[key(value)] : undefined;
      const normalized = values.find(allowed => key(allowed) === key(value)) || answer;
      if (value && !normalized) throw new Error(`${sheetName}, row ${row + 1}: ${COLUMNS[field]} is “${value}”. Use ${values.join(', ')}, or leave it blank.`);
      guest[field] = normalized || '';
    }
    result.guests.push({ ...guest, id: crypto.randomUUID() });
  }
  if (!result.guests.length) throw new Error('No guests were found below the guest headers.');
  return validateState(result);
}
