import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyState, importCSV, exportCSV, parseCSV, validateState, setMeal, meals, searchGuests, COLUMNS } from '../docs/core.mjs';
const guest = (i, extra = {}) => ({ name: `Guest ${i}`, company: '', title: '', contact: '', attendance: 'Not Arrived', starter: '', main: '', parking: 'No', taxi: 'No', notes: '', id: `id-${i}`, ...extra });
const stateWith = (...guests) => ({ ...emptyState(), guests });
test('starts empty and has the requested menu allocations', () => { const s = emptyState(); assert.equal(s.guests.length, 0); assert.equal(s.limits.starter['Salmon Trout'], 4); assert.equal(s.limits.main.Eggplant, 2); });
test('CSV handles BOM, multiline quoted values, commas, escaped quotes and all line endings', () => { assert.deepEqual(parseCSV('\uFEFFa,b\r"line\r\nnext","a,""b"""\r\n\n'), [['a', 'b'], ['line\r\nnext', 'a,"b"']]); });
test('CSV roundtrip preserves all fields including formula-like contact values and apostrophes', () => {
  for (const contact of ['  =HYPERLINK("example")', '+65 0000 0000', '@handle', '-1', '\t=1', "'original", "'=original", 'contact, "text"\r\nmore']) {
    const s = stateWith(guest(1, { contact, notes: 'Two\nlines', company: 'A, B', title: 'Host' }));
    assert.deepEqual(importCSV(exportCSV(s)), s);
  }
});
test('CSV protects spreadsheet formulas', () => { const out = parseCSV(exportCSV(stateWith(guest(1, { contact: '=1+1' })))); assert.equal(out[1][3], "'=1+1"); });
test('blank responses and existing No values stay intact; duplicate names get different IDs', () => {
  const headers = Object.values(COLUMNS).slice(0, 9).join(',');
  const s = importCSV(`${headers}\nSame,,,,,,,No,No\nSame,,,,,,,No,No`);
  assert.notEqual(s.guests[0].id, s.guests[1].id); assert.equal(s.guests[0].attendance, ''); assert.equal(s.guests[0].parking, 'No');
});
test('exhausted selections can be retained; new allocations are blocked and clearing releases portions', () => {
  const s = stateWith(...Array.from({ length: 5 }, (_, i) => guest(i, { starter: i < 4 ? 'Salmon Trout' : '' })));
  assert.equal(meals(s, 'starter')[0].remaining, 0);
  setMeal(s, 'id-0', 'starter', 'Salmon Trout');
  assert.throws(() => setMeal(s, 'id-4', 'starter', 'Salmon Trout'), /unavailable/);
  setMeal(s, 'id-0', 'starter', 'Chicken Breast'); assert.equal(meals(s, 'starter')[0].remaining, 1);
  setMeal(s, 'id-4', 'starter', 'Salmon Trout'); setMeal(s, 'id-4', 'starter', ''); assert.equal(meals(s, 'starter')[0].remaining, 1);
});
test('all attendance states count toward allocations and imported over-allocation is preserved', () => {
  const s = stateWith(...Array.from({ length: 3 }, (_, i) => guest(i, { attendance: 'Not Attending', main: 'Eggplant' })));
  const restored = importCSV(exportCSV(s)); assert.equal(restored.guests.length, 3); assert.equal(meals(restored, 'main').find(m => m.name === 'Eggplant').remaining, -1);
});
test('backup preserves full records, stable IDs and custom limits', () => { const s = stateWith(guest(1, { notes: 'Remember this', contact: 'not an email' })); s.limits.main.Laksa = 9; assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))), s); });
test('validation rejects corrupt CSV and backups without mutating current records', () => {
  const s = stateWith(guest(1)); const before = JSON.stringify(s);
  for (const input of ['a,b\n1,2', '"unclosed', 'a\na"b', 'a\n"a"b', exportCSV(stateWith(guest(1, { starter: 'Unknown' }))), exportCSV(stateWith(guest(1, { parking: 'Maybe' })))]) assert.throws(() => importCSV(input));
  for (const raw of [{}, { ...s, version: 99 }, { ...s, guests: [s.guests[0], s.guests[0]] }, { ...s, limits: {} }, { ...s, guests: [null] }]) assert.throws(() => validateState(raw));
  assert.equal(JSON.stringify(s), before);
});
test('partial name search ignores case', () => { const g = [guest(1, { name: 'ALPHA Visitor' }), guest(2)]; assert.deepEqual(searchGuests(g, 'pha v'), [g[0]]); });
test('private source CSV matches expected counts when supplied externally', { skip: !process.env.PRIVATE_GUEST_CSV }, async () => {
  const s = importCSV(await readFile(process.env.PRIVATE_GUEST_CSV, 'utf8'));
  assert.equal(s.guests.length, 11); assert.equal(meals(s, 'starter').find(m => m.name === 'Salmon Trout').remaining, 0); assert.equal(meals(s, 'main').find(m => m.name === 'Eggplant').remaining, 0);
  assert.ok(s.guests.every(g => g.parking === 'No' && g.taxi === 'No'));
  assert.deepEqual(importCSV(exportCSV(s)), s);
});
