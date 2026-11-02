import { openStore, seedIfEmpty } from './db.js';
import { CHART_TYPES, PALETTE } from './charts.js';

const el = (id) => document.getElementById(id);
const escape = (text) =>
  String(text ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );

const state = {
  store: null,
  tabs: [],
  items: [],
  history: [],
  reports: [],
  activeTabId: null,
  chartType: CHART_TYPES[0].id,
};

let chart = null;

const activeTab = () => state.tabs.find((tab) => tab.id === state.activeTabId);
const total = () => state.items.reduce((sum, item) => sum + item.count, 0);

/* ---------- tabs ---------- */

function renderTabs() {
  el('tabs').innerHTML = state.tabs
    .map(
      (tab) => `
      <div class="tab" role="tab" aria-selected="${tab.id === state.activeTabId}"
           data-id="${tab.id}" style="--tab-color:${escape(tab.color || PALETTE[0])}">
        <span class="dot"></span>
        <input class="tab-rename" value="${escape(tab.name)}" aria-label="List name"
               style="--name-width:${Math.max(tab.name.length, 4) + 1}ch" />
        <button class="kill" title="Delete this list">&times;</button>
      </div>`,
    )
    .join('');
}

// Bumped on every tab switch. A slow fetch for a tab she already clicked away
// from would otherwise land last and paint the wrong list.
let loadToken = 0;

async function selectTab(tabId) {
  const token = ++loadToken;
  state.activeTabId = tabId;
  state.items = [];
  state.history = [];
  state.reports = [];
  if (tabId) localStorage.setItem('theas-inventory:tab', tabId);

  renderTabs();
  renderItems();
  renderChart();

  if (!tabId) return;
  await loadTabData();
  if (token !== loadToken) return;

  renderItems();
  renderReports();
  prefillReportForm();
  renderChart();
}

async function loadTabData() {
  const items = await state.store.listItems(state.activeTabId);
  const [history, reports] = await Promise.all([
    state.store.listHistory(items.map((item) => item.id)),
    state.store.listReports(state.activeTabId),
  ]);
  state.items = items;
  state.history = history;
  state.reports = reports;
}

/* ---------- items ---------- */

function renderItems() {
  const tab = activeTab();
  el('list-title').textContent = tab ? tab.name : 'My list';
  el('list-total').textContent = `${total()} total`;

  el('items').innerHTML = state.items
    .map(
      (item) => `
      <tr data-id="${item.id}">
        <td><input class="item-name" type="text" value="${escape(item.name)}" /></td>
        <td>
          <div class="stepper">
            <button class="step-down" title="One less">&minus;</button>
            <input class="item-count" type="number" min="0" step="1" value="${item.count}" />
            <button class="step-up" title="One more">+</button>
          </div>
        </td>
        <td><input class="item-note" type="text" value="${escape(item.note || '')}" placeholder="…" /></td>
        <td><button class="row-kill" title="Remove">&times;</button></td>
      </tr>`,
    )
    .join('');
}

async function setCount(itemId, next) {
  const item = state.items.find((row) => row.id === itemId);
  const count = Math.max(0, Math.round(Number(next) || 0));
  if (count === item.count) return;

  item.count = count;
  await state.store.updateItem(itemId, { count });
  state.history.push({ item_id: itemId, count, recorded_at: new Date().toISOString() });
  el('list-total').textContent = `${total()} total`;
  renderChart();
}

/* ---------- chart ---------- */

function renderChart() {
  const definition = CHART_TYPES.find((type) => type.id === state.chartType);
  el('chart-blurb').textContent = definition.blurb;

  const nothingToShow =
    state.items.length === 0 || (definition.overTime && state.history.length === 0);
  el('chart-empty').hidden = !nothingToShow;
  el('chart').style.visibility = nothingToShow ? 'hidden' : 'visible';

  chart?.destroy();
  chart = null;
  if (nothingToShow) return;

  const config = definition.build(state.items, state.history);
  config.options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
    ...config.options,
  };
  chart = new Chart(el('chart'), config);
}

/* ---------- reports ---------- */

// Her latest write-up comes back when she returns to a list, so the form is a
// draft she can keep tweaking rather than something that vanishes on reload.
function prefillReportForm() {
  const latest = state.reports[0];
  el('report-subject').value = latest?.subject || '';
  el('report-author').value = latest?.author || '';
  el('report-notes').value = latest?.notes || '';
}

function renderReports() {
  el('report-list').innerHTML = state.reports
    .map(
      (report) => `
      <li data-id="${report.id}">
        <div>
          <h3>${escape(report.subject || 'Untitled report')}</h3>
          <p>${escape(report.notes || '')}</p>
          <time>${escape(report.author || 'Anonymous')} &middot; ${new Date(
            report.created_at,
          ).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}</time>
        </div>
        <button class="row-kill" title="Delete this report">&times;</button>
      </li>`,
    )
    .join('');
}

/* ---------- printing ---------- */

function buildPrintSheet() {
  const tab = activeTab();
  const subject = el('report-subject').value.trim() || tab?.name || 'My Inventory';
  const author = el('report-author').value.trim() || 'Thea';
  const notes = el('report-notes').value.trim() || state.reports[0]?.notes || '';
  const chartImage = chart ? chart.toBase64Image('image/png', 1) : null;

  el('print-sheet').innerHTML = `
    <article class="sheet">
      <div class="sheet-head">
        <p class="sub">Official Inventory Report</p>
        <h1>${escape(subject)}</h1>
        <p class="sub">Department of Counting Things</p>
      </div>

      <dl class="sheet-meta">
        <div><dt>List</dt><dd>${escape(tab?.name || '—')}</dd></div>
        <div><dt>Inventoried by</dt><dd>${escape(author)}</dd></div>
        <div><dt>Date</dt><dd>${new Date().toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}</dd></div>
      </dl>

      <h2>What I counted</h2>
      <table>
        <thead><tr><th>Thing</th><th>How many</th><th>Notes</th></tr></thead>
        <tbody>
          ${state.items
            .map(
              (item) => `<tr>
                <td>${escape(item.name)}</td>
                <td>${item.count}</td>
                <td>${escape(item.note || '')}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
        <tfoot><tr><td>Grand total</td><td>${total()}</td><td></td></tr></tfoot>
      </table>

      ${
        chartImage
          ? `<h2>My chart</h2><img class="sheet-chart" src="${chartImage}" alt="Chart of my counts" />`
          : ''
      }

      <h2>Notes &amp; findings</h2>
      <div class="sheet-notes">${escape(notes) || '&nbsp;'}</div>

      <div class="sheet-sign">
        <div class="line">Signed by the Chief Inventory Officer</div>
        <div class="sheet-seal">
          <span>Certified</span>
          <strong>${total()}</strong>
          <span>things counted</span>
        </div>
      </div>
    </article>`;
}

/* ---------- wiring ---------- */

function wireEvents() {
  el('tabs').addEventListener('click', async (event) => {
    const host = event.target.closest('.tab');
    if (!host) return;

    if (event.target.classList.contains('kill')) {
      const tab = state.tabs.find((row) => row.id === host.dataset.id);
      if (!confirm(`Delete the "${tab.name}" list and everything in it?`)) return;
      await state.store.deleteTab(tab.id);
      state.tabs = state.tabs.filter((row) => row.id !== tab.id);
      await selectTab(state.tabs[0]?.id ?? null);
      return;
    }

    if (host.dataset.id !== state.activeTabId) await selectTab(host.dataset.id);
  });

  el('tabs').addEventListener('change', async (event) => {
    if (!event.target.classList.contains('tab-rename')) return;
    const id = event.target.closest('.tab').dataset.id;
    const name = event.target.value.trim() || 'Untitled';
    await state.store.updateTab(id, { name });
    state.tabs.find((tab) => tab.id === id).name = name;
    renderTabs();
    renderItems();
  });

  el('add-tab').addEventListener('click', async () => {
    const name = prompt('What should this list be called?');
    if (!name?.trim()) return;
    const tab = await state.store.createTab(
      name.trim(),
      PALETTE[state.tabs.length % PALETTE.length],
      state.tabs.length,
    );
    state.tabs.push(tab);
    await selectTab(tab.id);
  });

  el('add-item').addEventListener('submit', async (event) => {
    event.preventDefault();
    const field = el('new-item');
    const name = field.value.trim();
    if (!name || !state.activeTabId) return;

    const item = await state.store.createItem(state.activeTabId, name, state.items.length);
    state.items.push(item);
    state.history.push({ item_id: item.id, count: 0, recorded_at: item.created_at });
    field.value = '';
    renderItems();
    renderChart();
  });

  el('items').addEventListener('click', async (event) => {
    const row = event.target.closest('tr');
    if (!row) return;
    const id = row.dataset.id;

    if (event.target.classList.contains('step-up') || event.target.classList.contains('step-down')) {
      const step = event.target.classList.contains('step-up') ? 1 : -1;
      const field = row.querySelector('.item-count');
      const next = Math.max(0, Number(field.value) + step);
      field.value = next;
      await setCount(id, next);
    }

    if (event.target.classList.contains('row-kill')) {
      await state.store.deleteItem(id);
      state.items = state.items.filter((item) => item.id !== id);
      state.history = state.history.filter((entry) => entry.item_id !== id);
      renderItems();
      renderChart();
    }
  });

  el('items').addEventListener('change', async (event) => {
    const row = event.target.closest('tr');
    if (!row) return;
    const id = row.dataset.id;

    if (event.target.classList.contains('item-count')) {
      await setCount(id, event.target.value);
      event.target.value = state.items.find((item) => item.id === id).count;
    }

    if (event.target.classList.contains('item-name')) {
      const name = event.target.value.trim() || 'New thing';
      await state.store.updateItem(id, { name });
      state.items.find((item) => item.id === id).name = name;
      renderChart();
    }

    if (event.target.classList.contains('item-note')) {
      const note = event.target.value.trim() || null;
      await state.store.updateItem(id, { note });
      state.items.find((item) => item.id === id).note = note;
    }
  });

  el('chart-picker').addEventListener('change', (event) => {
    state.chartType = event.target.value;
    localStorage.setItem('theas-inventory:chart', state.chartType);
    renderChart();
  });

  el('report-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.activeTabId) return;

    const report = await state.store.createReport({
      tab_id: state.activeTabId,
      subject: el('report-subject').value.trim() || null,
      author: el('report-author').value.trim() || null,
      notes: el('report-notes').value.trim() || null,
    });
    state.reports.unshift(report);
    renderReports();
  });

  el('report-list').addEventListener('click', async (event) => {
    if (!event.target.classList.contains('row-kill')) return;
    const id = event.target.closest('li').dataset.id;
    await state.store.deleteReport(id);
    state.reports = state.reports.filter((report) => report.id !== id);
    renderReports();
  });

  el('print-btn').addEventListener('click', () => {
    buildPrintSheet();
    window.print();
  });
}

async function start() {
  state.store = await openStore();

  const badge = el('mode-badge');
  badge.dataset.mode = state.store.mode;
  badge.textContent = {
    cloud: 'Saved to the cloud',
    practice: 'Practice mode — saves in this browser',
    offline: "Can't reach the cloud — saving in this browser",
  }[state.store.mode];

  el('chart-picker').innerHTML = CHART_TYPES.map(
    (type) => `<option value="${type.id}">${escape(type.label)}</option>`,
  ).join('');
  state.chartType = localStorage.getItem('theas-inventory:chart') || state.chartType;
  el('chart-picker').value = state.chartType;

  state.tabs = await seedIfEmpty(state.store, PALETTE);

  const remembered = localStorage.getItem('theas-inventory:tab');
  const initial = state.tabs.some((tab) => tab.id === remembered) ? remembered : state.tabs[0]?.id;

  wireEvents();
  await selectTab(initial ?? null);
}

start();
