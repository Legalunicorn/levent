import { emptyState, validateState, importCSV, exportCSV, meals, setMeal, missingMeal, searchGuests, ATTENDANCE, ANSWERS } from './core.mjs';
const $ = id => document.getElementById(id);
const KEY = `gather:v1:${location.pathname.replace(/index\.html$/, '')}`;
let state = emptyState(), currentView = 'guests', filter = 'all', activeId = null, saved = false, storageBroken = false, scrollY = 0, returnFocus = null;
function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
function button(text, cls, action) { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', action); return b; }
function notice(message = '') { $('notice').textContent = message; $('notice').hidden = !message; }
function savingStatus(message, error = false) { $('save-status').textContent = message; $('save-status').classList.toggle('error', error); $('detail-save').textContent = message; $('detail-save').classList.toggle('error-text', error); }
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); saved = true; if (storageBroken) notice(); storageBroken = false; savingStatus('✓ Saved on this device'); }
  catch { saved = false; storageBroken = true; savingStatus('Not saved · Export a backup now', true); notice('Saving failed. Your current edits are only in memory. Export a JSON backup before closing or refreshing this page.'); }
}
try { const raw = localStorage.getItem(KEY); if (raw) { state = validateState(JSON.parse(raw)); saved = true; savingStatus('✓ Restored from this device'); } }
catch { storageBroken = true; notice('Saved data could not be read. It has not been overwritten. Restore a valid backup or import a CSV to continue.'); savingStatus('Local storage unavailable or saved data invalid', true); }

function stat(value, label, cls = '') { const box = el('div', 'stat'); box.append(el('span', `stat-value ${cls}`, value), el('span', 'stat-label', label)); return box; }
function renderOverview() {
  $('overview').replaceChildren(stat(state.guests.length, 'Guests on the list'), stat(state.guests.filter(g => g.attendance === 'Arrived').length, 'Arrived & welcomed', 'stat-accent'), stat(state.guests.filter(missingMeal).length, 'Still need meal choices', 'stat-warm'), stat(state.guests.filter(g => g.parking === 'Yes').length, 'Parking coupons requested'));
  $('guest-count').textContent = state.guests.length;
  $('top-import').textContent = state.guests.length ? '＋ Replace guest list' : '＋ Import guest list';
}
function renderList() {
  const guests = searchGuests(state.guests, $('search').value).filter(g => filter === 'all' || (filter === 'missing' ? missingMeal(g) : g.attendance === 'Arrived'));
  $('list-caption').textContent = state.guests.length ? `${guests.length} of ${state.guests.length} guests · Tap a card to update details` : 'YOUR GUEST LIST';
  const cards = guests.map(g => {
    const card = button('', 'guest-card', () => openGuest(g.id)); card.dataset.guestId = g.id;
    const top = el('div', 'card-top');
    top.append(el('span', 'avatar', g.name.trim().split(/\s+/).slice(0, 2).map(p => [...p][0]).join('').toUpperCase()), el('span', `badge ${g.attendance === 'Arrived' ? 'arrived' : g.attendance === 'Not Attending' ? 'absent' : ''}`, g.attendance || 'Attendance not set'));
    const selections = el('div', 'card-meals');
    for (const [key, label] of [['starter', 'Starter'], ['main', 'Main']]) { const row = el('div', 'meal-row'); row.append(el('span', 'course-label', label), el('span', g[key] ? '' : 'missing', g[key] || 'Not selected')); selections.append(row); }
    const foot = el('div', `card-foot ${missingMeal(g) ? '' : 'complete'}`); foot.append(el('span', '', missingMeal(g) ? '○ Meal choices needed' : '✓ Meal choices complete'), el('span', 'card-arrow', '↗'));
    card.append(top, el('h3', 'guest-name', g.name), el('div', 'company', g.company || 'Company not provided'), selections, foot); return card;
  });
  if (!cards.length) {
    const box = el('div', 'empty'); box.append(el('div', 'empty-icon', state.guests.length ? '⌕' : 'g.'), el('h2', '', state.guests.length ? 'No guests found' : 'Good hosting starts here.'), el('p', '', state.guests.length ? 'Try another name or switch your guest filter.' : 'Import your private guest CSV to get started. Your list and responses stay in this browser.'));
    box.append(button(state.guests.length ? 'Reset search & filters' : 'Import guest list', 'primary', () => { if (!state.guests.length) $('csv-file').click(); else { $('search').value = ''; selectFilter('all'); } })); cards.push(box);
  }
  $('guest-list').replaceChildren(...cards);
}
function renderSummary() {
  const root = $('summary-view'); root.replaceChildren();
  const head = el('div', 'section-heading'); head.append(el('p', 'eyebrow', 'THE EVENT AT A GLANCE'), el('h2', '', 'Every portion accounted for.'), el('p', '', 'Remaining = ordered minus selected. Meals count for all guests, including those not attending.')); root.append(head);
  const grid = el('div', 'summary-grid');
  for (const course of ['starter', 'main']) {
    const panel = el('article', 'panel'); panel.append(el('h3', '', course === 'starter' ? 'Starters' : 'Mains'));
    for (const m of meals(state, course)) {
      const row = el('div', `dish-row ${m.remaining <= 0 ? 'unavailable' : ''}`), top = el('div', 'dish-top');
      top.append(el('span', '', m.name), el('strong', '', `${m.remaining} remaining`));
      // Use a native progress element to keep styling compatible with the CSP.
      const progress = el('progress'); progress.max = Math.max(m.ordered, m.selected, 1); progress.value = m.selected; progress.setAttribute('aria-label', `${m.name}: ${m.selected} selected of ${m.ordered} ordered`);
      row.append(top, el('div', 'dish-detail', `${m.ordered} ordered · ${m.selected} selected${m.remaining < 0 ? ` · Over-allocated by ${-m.remaining}` : m.remaining === 0 ? ' · Unavailable' : ''}`), progress); panel.append(row);
    } grid.append(panel);
  } root.append(grid);
  const counts = el('div', 'summary-counts');
  const data = [['Total guests', state.guests.length], ...ATTENDANCE.map(v => [v, state.guests.filter(g => g.attendance === v).length]), ['Attendance not set', state.guests.filter(g => !g.attendance).length], ['Missing either meal', state.guests.filter(missingMeal).length], ['Missing starter', state.guests.filter(g => !g.starter).length], ['Missing main', state.guests.filter(g => !g.main).length], ['Parking coupons', state.guests.filter(g => g.parking === 'Yes').length], ['Taxi / Grab reimbursements', state.guests.filter(g => g.taxi === 'Yes').length]];
  for (const [label, value] of data) { const item = el('div', 'panel'); item.append(el('strong', '', value), el('span', '', label)); counts.append(item); } root.append(counts);
}
function render() { renderOverview(); renderList(); renderSummary(); }
function selectFilter(value) { filter = value; document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b.dataset.filter === filter)); renderList(); }
document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => selectFilter(b.dataset.filter)));
$('search').addEventListener('input', renderList);
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { currentView = b.dataset.view; for (const v of ['guests', 'summary', 'data']) $(`${v}-view`).hidden = v !== currentView; document.querySelectorAll('[data-view]').forEach(n => n === b ? n.setAttribute('aria-current', 'page') : n.removeAttribute('aria-current')); }));

function updateField(key, value) { const guest = state.guests.find(g => g.id === activeId); if (!guest) return; guest[key] = value; persist(); render(); }
function fieldLabel(text, id) { const l = el('label', 'field-label', text); if (id) l.htmlFor = id; return l; }
function buildDetail() {
  const g = state.guests.find(g => g.id === activeId), root = $('guest-detail'); root.replaceChildren();
  const name = el('h2', 'detail-name', g.name); name.id = 'detail-name'; root.append(name, el('p', 'detail-meta', [g.title, g.company].filter(Boolean).join(' · ')), el('p', 'detail-contact', g.contact || 'No contact information'));
  const label = fieldLabel('Attendance'); label.id = 'attendance-label'; root.append(label);
  const attendance = el('div', 'segmented'); attendance.setAttribute('role', 'group'); attendance.setAttribute('aria-labelledby', 'attendance-label');
  for (const v of ATTENDANCE) { const b = button(v, '', () => { updateField('attendance', v); attendance.querySelectorAll('button').forEach(n => n.setAttribute('aria-pressed', n === b)); }); b.setAttribute('aria-pressed', g.attendance === v); attendance.append(b); } root.append(attendance);
  if (!g.attendance) root.append(el('p', 'muted', 'Attendance has not been set.'));
  for (const course of ['starter', 'main']) { root.append(fieldLabel(course === 'starter' ? 'Lunch starter' : 'Lunch main', `choose-${course}`)); const b = button('', 'picker-button', () => openMeals(course)); b.id = `choose-${course}`; b.setAttribute('aria-haspopup', 'dialog'); root.append(b); }
  const pair = el('div', 'detail-two');
  for (const [key, label] of [['parking', 'Parking coupon'], ['taxi', 'Taxi / Grab reimbursement']]) {
    const wrap = el('div'), select = el('select'); select.id = `edit-${key}`;
    if (!g[key]) { const option = el('option', '', 'Not set (blank)'); option.value = ''; select.append(option); }
    for (const v of ANSWERS) { const option = el('option', '', v); option.value = v; select.append(option); } select.value = g[key]; select.addEventListener('change', () => updateField(key, select.value)); wrap.append(fieldLabel(label, select.id), select); pair.append(wrap);
  } root.append(pair);
  const notes = el('textarea'); notes.id = 'edit-notes'; notes.value = g.notes; notes.placeholder = 'Anything useful to remember…'; notes.addEventListener('input', () => updateField('notes', notes.value)); root.append(fieldLabel('Notes · optional', notes.id), notes); refreshMealButtons();
}
function refreshMealButtons() { const g = state.guests.find(g => g.id === activeId); if (!g) return; for (const c of ['starter', 'main']) { const b = $(`choose-${c}`); if (b) b.replaceChildren(el('span', '', g[c] || 'Not selected'), el('small', '', 'Change ▾')); } }
function openGuest(id) { activeId = id; scrollY = window.scrollY; returnFocus = document.activeElement; buildDetail(); document.body.classList.add('modal-open'); $('guest-dialog').showModal(); }
function closeGuest() { $('guest-dialog').close(); }
$('close-detail').addEventListener('click', closeGuest); $('done-detail').addEventListener('click', closeGuest);
$('guest-dialog').addEventListener('close', () => { document.body.classList.remove('modal-open'); const target = [...document.querySelectorAll('[data-guest-id]')].find(b => b.dataset.guestId === activeId); (target || returnFocus)?.focus({ preventScroll: true }); window.scrollTo(0, scrollY); activeId = null; });
function openMeals(course) {
  const g = state.guests.find(g => g.id === activeId); $('meal-title').textContent = course === 'starter' ? 'Choose a starter' : 'Choose a main';
  const options = $('meal-options'); options.replaceChildren();
  const choose = dish => { try { setMeal(state, activeId, course, dish); persist(); render(); refreshMealButtons(); $('meal-dialog').close(); } catch (e) { notice(e.message); } };
  const clear = button('Not selected', 'meal-option clear-choice', () => choose('')); clear.setAttribute('aria-pressed', !g[course]); options.append(clear);
  for (const m of meals(state, course)) {
    const current = g[course] === m.name, unavailable = m.remaining <= 0, blocked = unavailable && !current;
    const b = button('', `meal-option ${unavailable ? 'unavailable' : ''}`, () => { if (!blocked) choose(m.name); });
    const text = el('span', '', `${m.name} (${m.remaining})`); text.append(el('small', '', current ? `Current choice · ${unavailable ? 'Unavailable for other guests' : 'Keep this selection'}` : unavailable ? 'Unavailable' : 'Available'));
    b.append(text, el('span', '', current ? '✓' : blocked ? '—' : '+')); b.setAttribute('aria-pressed', current); b.setAttribute('aria-disabled', blocked); options.append(b);
  } $('meal-dialog').showModal();
}
$('close-meal').addEventListener('click', () => $('meal-dialog').close());

function confirmReplace(action) { return (!state.guests.length && !storageBroken) || confirm(`${action} will replace the guest data saved for this website in this browser. Export a backup first if you need to keep it. Continue?`); }
function overages() { return ['starter', 'main'].flatMap(c => meals(state, c).filter(m => m.remaining < 0).map(m => `${m.name}: ${-m.remaining} over the allocation`)); }
async function readImport(input, kind) {
  const file = input.files[0]; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Please choose a file smaller than 10 MB.');
    const text = await file.text(); const next = kind === 'csv' ? importCSV(text) : validateState(JSON.parse(text.replace(/^\uFEFF/, '')));
    if (!confirmReplace(kind === 'csv' ? 'Importing this CSV' : 'Restoring this backup')) return;
    state = next; $('search').value = ''; filter = 'all'; notice(); persist(); render(); selectFilter('all');
    const warnings = overages(); if (warnings.length && !storageBroken) notice(`Imported all records. Please resolve these meal allocations in Summary:\n${warnings.join('\n')}`);
  } catch (e) { notice(`Import not completed. Existing records are unchanged. ${e.message}`); }
  finally { input.value = ''; }
}
for (const id of ['top-import', 'replace-list']) $(id).addEventListener('click', () => $('csv-file').click());
$('restore-backup').addEventListener('click', () => $('json-file').click());
$('csv-file').addEventListener('change', () => readImport($('csv-file'), 'csv'));
$('json-file').addEventListener('change', () => readImport($('json-file'), 'json'));
function download(text, type, extension) { const url = URL.createObjectURL(new Blob([text], { type })); const a = el('a'); a.href = url; a.download = `gather-${extension === 'json' ? 'backup' : 'guests'}-${new Date().toISOString().slice(0, 10)}.${extension}`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
$('export-backup').addEventListener('click', () => { download(JSON.stringify(state, null, 2), 'application/json', 'json'); $('backup-status').textContent = `Backup download requested at ${new Date().toLocaleTimeString()}. Check Files to confirm it was saved.`; });
$('export-csv').addEventListener('click', () => download(exportCSV(state), 'text/csv;charset=utf-8', 'csv'));
$('clear-data').addEventListener('click', () => {
  if (!confirm('Clear all guest records and responses from this browser? Export a backup first. This cannot be undone without a backup.')) return;
  try { localStorage.removeItem(KEY); state = emptyState(); saved = false; storageBroken = false; $('search').value = ''; notice(); selectFilter('all'); render(); savingStatus('Local data cleared'); }
  catch { notice('Could not clear saved data. Your records have been kept.'); }
});
window.addEventListener('beforeunload', e => { if (state.guests.length && !saved) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('storage', e => {
  if (e.key !== KEY && e.key !== null) return;
  if (!saved && state.guests.length) { notice('Another tab changed this list while this tab has unsaved edits. Export a backup from this tab, then refresh to load the other tab’s records.'); return; }
  try { state = e.newValue ? validateState(JSON.parse(e.newValue)) : emptyState(); $('meal-dialog').close(); $('guest-dialog').close(); saved = true; render(); savingStatus('Updated from another tab on this device'); }
  catch { notice('Another tab saved data that could not be read. Current records are still shown.'); }
});
render();
