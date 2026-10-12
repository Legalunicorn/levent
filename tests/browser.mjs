// Optional UI QA: install Playwright separately or point PLAYWRIGHT_MODULE to it.
// Uses generated synthetic data only. Screenshots require QA_OUTPUT outside docs/.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { emptyState, exportCSV, importCSV, validateState } from '../docs/core.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: '4174' }, windowsHide: true });
await once(server.stdout, 'data');
const baseURL = 'http://127.0.0.1:4174';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
  if (process.env.PRIVATE_GUEST_XLSX) {
    const excelContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const excelPage = await excelContext.newPage();
    await excelPage.goto(baseURL);
    assert.match(await excelPage.locator('#csv-file').getAttribute('accept'), /\.xlsx/);
    await excelPage.locator('#csv-file').setInputFiles(process.env.PRIVATE_GUEST_XLSX);
    await excelPage.locator('.guest-card').nth(10).waitFor();
    assert.equal(await excelPage.locator('.guest-card').count(), 11);
    const records = await excelPage.evaluate(() => JSON.parse(localStorage.getItem('gather:v1:/')).guests);
    assert.equal(records.filter(g => g.starter === 'Salmon Trout').length, 4);
    assert.equal(records.filter(g => g.main === 'Eggplant').length, 2);
    assert.ok(records.every(g => g.parking === 'No' && g.taxi === 'No'));
    await excelPage.locator('#csv-file').setInputFiles({ name: 'broken.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('broken') });
    await excelPage.getByText(/Import not completed/).waitFor();
    assert.equal(await excelPage.locator('.guest-card').count(), 11);
    await excelContext.close();
    console.log('PASS: original private Excel workbook imports directly in browser; corrupt Excel preserves current records.');
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  let page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const response = await page.goto(baseURL); assert.equal(response.status(), 200);
  await page.getByText('Good hosting starts here.').waitFor();
  assert.equal(await page.locator('.guest-card').count(), 0);
  const fresh = await browser.newContext(); const freshPage = await fresh.newPage(); await freshPage.goto(baseURL);
  const s = emptyState(); s.guests = Array.from({ length: 6 }, (_, i) => ({ id: `generated-${i}`, name: `Guest ${i + 1}`, company: 'Example company', title: 'Event visitor', contact: i === 0 ? '<img src=x onerror=alert(1)>' : '+65 0000 0000', attendance: 'Not Arrived', starter: i < 4 ? 'Salmon Trout' : '', main: i < 2 ? 'Eggplant' : '', parking: 'No', taxi: 'No', notes: '' }));
  await page.locator('#csv-file').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(exportCSV(s)) });
  await page.locator('.guest-card').nth(5).waitFor();
  assert.equal(await freshPage.locator('.guest-card').count(), 0); await fresh.close();
  await page.locator('#search').fill('gUeSt 5'); assert.equal(await page.locator('.guest-card').count(), 1);
  await page.locator('.guest-card').click(); await page.locator('#choose-starter').click();
  const exhausted = page.getByRole('button', { name: /Salmon Trout \(0\)/ });
  assert.equal(await exhausted.getAttribute('aria-disabled'), 'true'); assert.equal(await exhausted.evaluate(n => getComputedStyle(n).color), 'rgb(166, 46, 54)');
  await exhausted.click({ force: true }); assert.equal(await page.locator('#meal-dialog').evaluate(n => n.open), true);
  await page.getByRole('button', { name: /Chicken Breast \(4\)/ }).click();
  await page.locator('#edit-notes').fill('A note saved automatically'); await page.getByRole('button', { name: 'Arrived', exact: true }).last().click();
  await page.locator('#done-detail').click(); assert.equal(await page.locator('#search').inputValue(), 'gUeSt 5');
  await page.reload(); await page.locator('#search').fill('Guest 5'); await page.locator('.guest-card').click();
  assert.equal(await page.locator('#edit-notes').inputValue(), 'A note saved automatically'); assert.match(await page.locator('#choose-starter').textContent(), /Chicken Breast/);
  await page.locator('#done-detail').click();
  await page.locator('#search').fill('Guest 1'); await page.locator('.guest-card').click(); assert.equal(await page.locator('#guest-detail img').count(), 0);
  await page.locator('#choose-starter').click(); assert.equal(await exhausted.getAttribute('aria-disabled'), 'false'); await exhausted.click();
  await page.locator('#choose-starter').click(); await page.getByRole('button', { name: 'Not selected', exact: true }).click();
  await page.locator('#choose-starter').click(); assert.match(await page.getByRole('button', { name: /Salmon Trout \(1\)/ }).textContent(), /Available/); await page.locator('#close-meal').click();
  await page.locator('#choose-main').click(); assert.equal(await page.getByRole('button', { name: /Eggplant \(0\)/ }).getAttribute('aria-disabled'), 'false'); await page.locator('#close-meal').click(); await page.locator('#done-detail').click();
  await page.locator('#csv-file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('Name\nInvalid') });
  await page.getByText(/Import not completed/).waitFor(); await page.locator('#search').fill(''); assert.equal(await page.locator('.guest-card').count(), 6);
  await page.getByRole('button', { name: 'Backup & data', exact: true }).click();
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-backup').click(); const download = await downloadPromise;
  const backup = await readFile(await download.path(), 'utf8'); assert.equal(validateState(JSON.parse(backup)).guests[4].notes, 'A note saved automatically');
  page.once('dialog', d => d.dismiss()); await page.locator('#clear-data').click();
  page.once('dialog', d => d.accept()); await page.locator('#clear-data').click();
  await page.locator('#json-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) }); await page.getByText('✓ Saved on this device', { exact: true }).first().waitFor();
  await page.close(); page = await context.newPage(); await page.goto(baseURL); assert.equal(await page.locator('.guest-card').count(), 6);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await page.locator('.guest-card').first().click(); await page.locator('#edit-notes').fill('unsaved edit'); await page.locator('#done-detail').click();
  await page.getByText('Not saved · Export a backup now', { exact: true }).first().waitFor();
  page.on('dialog', d => d.accept()); await page.reload(); await page.locator('.guest-card').first().click(); assert.notEqual(await page.locator('#edit-notes').inputValue(), 'unsaved edit'); await page.locator('#done-detail').click();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}`);
  }
  if (process.env.QA_OUTPUT) {
    await mkdir(process.env.QA_OUTPUT, { recursive: true });
    await page.screenshot({ path: join(process.env.QA_OUTPUT, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: join(process.env.QA_OUTPUT, 'mobile.png'), fullPage: true });
    await page.locator('.guest-card').nth(2).click(); await page.locator('#choose-main').click(); await page.screenshot({ path: join(process.env.QA_OUTPUT, 'picker.png') });
  }
  assert.deepEqual(errors, []); console.log('PASS: empty isolation, mobile search, meal caps and retention, clearing, persistence/reopen, safe text, invalid import, backup/restore, clear confirmation, failed saving, responsive widths.');
} finally { await browser.close(); server.kill(); }
