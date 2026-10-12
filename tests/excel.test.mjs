import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importExcel, importGuestFile } from '../docs/excel.mjs';
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
  await assert.rejects(importExcel(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })), /Name or Guest name/);
});
test('edited workbook allows renamed sheet, moved and reordered headers, extra columns and changed values', async () => {
  const rows = [['Event'], [], [], [], [], ['Extra column', ' MAIN ', 'Guest Name', 'Parking coupon', 'Notes', 'Email', 'Starter', 'Attendance status'],
    ['Ignore this', ' laksa ', 'Updated guest', ' no ', 'New note', ' exact contact text ', 'salmon trout', ' arrived '],
    ['Ignore this too', 'Not selected', 'Additional guest', true, '', 'not an email', ' chicken breast ', 'not attending'],
    ['Only extra-column data'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Updated list');
  const result = await importExcel(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
  assert.equal(result.guests.length, 2);
  assert.equal(result.guests[0].main, 'Laksa'); assert.equal(result.guests[0].parking, 'No');
  assert.equal(result.guests[0].attendance, 'Arrived'); assert.equal(result.guests[0].notes, 'New note');
  assert.equal(result.guests[0].contact, ' exact contact text ');
  assert.equal(result.guests[1].main, ''); assert.equal(result.guests[1].parking, 'Yes');
  assert.equal(result.guests[1].company, '');
});
test('bad edited values identify the actual sheet row before replacing anything', async () => {
  const sheet = XLSX.utils.aoa_to_sheet([[], [], [], [], [], ['Name', 'Starter'], ['Guest', 'Unknown dish']]);
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Guests');
  await assert.rejects(importExcel(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })), /Guests, row 7/);
});
test('Excel content is detected even with a CSV filename, preserving literal quotes', async () => {
  const contact = 'Guest "quoted", contact\nsecond line';
  const sheet = XLSX.utils.aoa_to_sheet([[], [], [], Object.values(COLUMNS).slice(0, 9),
    ['Guest "1"', 'Company, Inc.', '', contact, 'Not Arrived', '', '', 'No', 'No']]);
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Event Registration');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  for (const filename of ['Attendance List.xlsx', 'Attendance List.csv', 'Attendance List.xlxs', 'Attendance List']) {
    const result = await importGuestFile(new File([bytes], filename));
    assert.equal(result.guests[0].contact, contact);
    assert.equal(result.guests[0].name, 'Guest "1"');
  }
});
test('original private workbook imports all 11 guests exactly', { skip: !process.env.PRIVATE_GUEST_XLSX || !process.env.PRIVATE_GUEST_CSV }, async () => {
  const result = await importGuestFile(new File([await readFile(process.env.PRIVATE_GUEST_XLSX)], 'Attendance List.xlsx'));
  const expected = importCSV(await readFile(process.env.PRIVATE_GUEST_CSV, 'utf8'));
  const withoutIds = s => s.guests.map(({ id, ...fields }) => fields);
  assert.deepEqual(withoutIds(result), withoutIds(expected));
  assert.equal(result.guests.length, 11);
  assert.equal(meals(result, 'starter').find(m => m.name === 'Salmon Trout').remaining, 0);
  assert.equal(meals(result, 'main').find(m => m.name === 'Eggplant').remaining, 0);
});
