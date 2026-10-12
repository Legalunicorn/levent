import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importExcel } from '../docs/excel.mjs';
import { importCSV, COLUMNS, meals } from '../docs/core.mjs';
import * as XLSX from '../docs/vendor/xlsx.mjs';

test('Excel import reads row 4 and columns A–I, preserving blanks and ignoring hotel totals', async () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Event'], [], [], Object.values(COLUMNS).slice(0, 9),
    ['Guest 1', 'Example, Inc.', 'Host', 'contact text', 'Not Arrived', 'Salmon Trout', '', 'No', 'No', '', 'Not a guest'],
    ['', '', '', '', '', '', '', '', '', '', 'Hotel totals'],
  ]);
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Event Registration');
  const result = await importExcel(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
  assert.equal(result.guests.length, 1); assert.equal(result.guests[0].contact, 'contact text');
  assert.equal(result.guests[0].main, ''); assert.equal(result.guests[0].parking, 'No');
});
test('bad Excel imports are rejected', async () => {
  await assert.rejects(importExcel(new Uint8Array([0, 1, 2, 3])));
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['wrong']]), 'Other');
  await assert.rejects(importExcel(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })), /Event Registration/);
});
test('original private workbook imports all 11 guests exactly', { skip: !process.env.PRIVATE_GUEST_XLSX || !process.env.PRIVATE_GUEST_CSV }, async () => {
  const result = await importExcel(await readFile(process.env.PRIVATE_GUEST_XLSX));
  const expected = importCSV(await readFile(process.env.PRIVATE_GUEST_CSV, 'utf8'));
  const withoutIds = s => s.guests.map(({ id, ...fields }) => fields);
  assert.deepEqual(withoutIds(result), withoutIds(expected));
  assert.equal(result.guests.length, 11);
  assert.equal(meals(result, 'starter').find(m => m.name === 'Salmon Trout').remaining, 0);
  assert.equal(meals(result, 'main').find(m => m.name === 'Eggplant').remaining, 0);
});
