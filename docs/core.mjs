export const VERSION = 1;
export const DEFAULT_LIMITS = {
  starter: { 'Salmon Trout': 4, 'Chicken Breast': 4, 'Prawn Brisque': 4, 'Burratina & Tomatoes': 2, 'Iceplant Salad': 2 },
  main: { 'Bak Kut Teh': 6, Laksa: 4, 'Chicken Rice': 4, Eggplant: 2 },
};
export const COLUMNS = { name: 'Name', company: 'Company', title: 'Title', contact: 'Email', attendance: 'Attendance', starter: 'Preferred Lunch Starter', main: 'Preferred Lunch Main', parking: 'Carpark Coupon?', taxi: 'Taxi/Grab Reimbursement?', notes: 'Notes', id: 'Guest ID' };
export const ATTENDANCE = ['Not Arrived', 'Arrived', 'Not Attending'];
export const ANSWERS = ['Yes', 'No', 'Not asked'];
export const emptyState = () => ({ version: VERSION, guests: [], limits: structuredClone(DEFAULT_LIMITS) });
const danger = /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/;
const uid = () => crypto.randomUUID();

export function parseCSV(input) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  const endCell = () => { row.push(cell); cell = ''; closed = false; };
  const endRow = () => { endCell(); if (row.some(v => v.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === ',') endCell();
    else if (c === '\r' || c === '\n') { endRow(); if (c === '\r' && text[i + 1] === '\n') i++; }
    else if (closed) throw new Error('Unexpected text after a closing quote. Please check the CSV format.');
    else if (c === '"') { if (cell) throw new Error('A quote inside a CSV value must be escaped.'); quoted = true; }
    else cell += c;
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted value.');
  if (cell || row.length || closed) endRow();
  return rows;
}

function validateGuest(g, index, ids) {
  const label = `Guest row ${index + 2}`;
  if (!g || typeof g !== 'object') throw new Error(`${label}: guest record must be an object.`);
  for (const key of Object.keys(COLUMNS)) if (typeof g[key] !== 'string') throw new Error(`${label}: ${COLUMNS[key]} must be text.`);
  if (!g.name.trim()) throw new Error(`${label}: Name is required.`);
  if (!g.id.trim() || ids.has(g.id)) throw new Error(`${label}: Guest ID is missing or duplicated.`);
  ids.add(g.id);
  for (const [key, allowed] of [['attendance', ATTENDANCE], ['parking', ANSWERS], ['taxi', ANSWERS], ['starter', Object.keys(DEFAULT_LIMITS.starter)], ['main', Object.keys(DEFAULT_LIMITS.main)]]) {
    if (g[key] !== '' && !allowed.includes(g[key])) throw new Error(`${label}: invalid ${COLUMNS[key]} value “${g[key]}”. Use ${allowed.join(', ')}, or leave it blank.`);
  }
  return Object.fromEntries(Object.keys(COLUMNS).map(k => [k, g[k]]));
}

export function importCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The CSV must contain column headers and at least one guest.');
  const headers = rows.shift().map(h => h.trim());
  if (new Set(headers).size !== headers.length) throw new Error('The CSV has duplicate column headers.');
  const missing = Object.values(COLUMNS).slice(0, 9).filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`Missing column headers: ${missing.join(', ')}.`);
  const ids = new Set();
  const guests = rows.map((row, i) => {
    if (row.length !== headers.length) throw new Error(`Guest row ${i + 2}: expected ${headers.length} columns, found ${row.length}.`);
    const escaped = row[headers.indexOf('CSV Encoding')] === 'formula-escaped-v1';
    const g = Object.fromEntries(Object.entries(COLUMNS).map(([k, h]) => {
      let v = row[headers.indexOf(h)] ?? '';
      if (escaped && v.startsWith("'") && (danger.test(v.slice(1)) || v.startsWith("''"))) v = v.slice(1);
      return [k, v];
    }));
    g.id ||= uid();
    return validateGuest(g, i, ids);
  });
  return { ...emptyState(), guests };
}

export function validateState(raw) {
  if (!raw || raw.version !== VERSION || !Array.isArray(raw.guests) || !raw.limits) throw new Error('This is not a supported version 1 guest-tracker backup.');
  const limits = {};
  for (const course of ['starter', 'main']) {
    const values = raw.limits[course];
    if (!values || Object.keys(values).length !== Object.keys(DEFAULT_LIMITS[course]).length) throw new Error(`Invalid ${course} meal allocations.`);
    limits[course] = {};
    for (const dish of Object.keys(DEFAULT_LIMITS[course])) {
      if (!Number.isSafeInteger(values[dish]) || values[dish] < 0) throw new Error(`Invalid allocation for ${dish}.`);
      limits[course][dish] = values[dish];
    }
  }
  const ids = new Set();
  return { version: VERSION, limits, guests: raw.guests.map((g, i) => validateGuest(g, i, ids)) };
}

export function meals(state, course) {
  return Object.entries(state.limits[course]).map(([name, ordered]) => {
    const selected = state.guests.filter(g => g[course] === name).length;
    return { name, ordered, selected, remaining: ordered - selected };
  });
}
export function setMeal(state, id, course, dish) {
  if (!['starter', 'main'].includes(course)) throw new Error('Unknown meal course.');
  const guest = state.guests.find(g => g.id === id);
  if (!guest) throw new Error('Guest not found.');
  const choice = meals(state, course).find(m => m.name === dish);
  if (dish && (!choice || (guest[course] !== dish && choice.remaining <= 0))) throw new Error('This dish is unavailable. Clear another selection first.');
  guest[course] = dish;
}
export const missingMeal = g => !g.starter || !g.main;
export const searchGuests = (guests, query) => guests.filter(g => g.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
export function exportCSV(state) {
  const quote = v => '"' + v.replaceAll('"', '""') + '"';
  const safe = v => danger.test(v) || v.startsWith("'") ? "'" + v : v;
  return '\uFEFF' + [Object.values(COLUMNS).concat('CSV Encoding'), ...state.guests.map(g => Object.keys(COLUMNS).map(k => safe(g[k])).concat('formula-escaped-v1'))].map(r => r.map(quote).join(',')).join('\r\n');
}
