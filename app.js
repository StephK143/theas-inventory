import { openStore, seedIfEmpty } from './db.js';
import { CHART_TYPES, PALETTE, prepareItems } from './charts.js';

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
  chartLimit: 10,
};

let chart = null;

const activeTab = () => state.tabs.find((tab) => tab.id === state.activeTabId);
const total = () => state.items.reduce((sum, item) => sum + item.count, 0);

// Position from the highest existing row rather than the row count, so a
// failed save can't leave two items fighting over the same slot.
const nextSortOrder = () =>
  state.items.reduce((highest, item) => Math.max(highest, item.sort_order ?? 0), -1) + 1;

let toastTimer = null;

function showToast(message, kind = 'info') {
  const toast = el('toast');
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, kind === 'error' ? 7000 : 2800);
}

// Browsers phrase a dropped connection as "TypeError: Failed to fetch", which
// means nothing to a kid.
function friendly(error) {
  const text = error?.message || 'something went wrong';
  return /failed to fetch|networkerror|load failed|network request failed/i.test(text)
    ? 'the internet connection dropped'
    : text;
}

// Nothing in here used to report failure, so a dropped request looked exactly
// like a no-op and she would just click again.
async function save(description, work) {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    console.error(description, error);
    showToast(`Couldn't ${description} — ${friendly(error)}. Nothing was lost, try again.`, 'error');
    return { ok: false };
  }
}

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
  const loaded = await save(`open "${activeTab()?.name ?? 'that list'}"`, loadTabData);
  if (token !== loadToken || !loaded.ok) return;

  renderItems();
  renderReports();
  prefillReportForm();
  renderChart();
}

async function loadTabData() {
  const [items, history, reports] = await Promise.all([
    state.store.listItems(state.activeTabId),
    state.store.listHistory(state.activeTabId),
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

  const previous = item.count;
  item.count = count;
  el('list-total').textContent = `${total()} total`;
  renderChart();

  const result = await save(`save ${item.name}`, () =>
    state.store.updateItem(itemId, { count }),
  );

  if (!result.ok) {
    item.count = previous;
    renderItems();
    renderChart();
    return;
  }

  state.history.push({ item_id: itemId, count, recorded_at: new Date().toISOString() });
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

  if (nothingToShow) {
    el('chart-note').textContent = '';
    el('chart-frame').style.height = '300px';
    return;
  }

  const { items, note } = prepareItems(definition, state.items, state.chartLimit);
  el('chart-note').textContent = note;
  el('chart-frame').style.height = `${definition.height?.(items.length) ?? 300}px`;

  const config = definition.build(items, state.history);
  config.options = {
    responsive: true,
    maintainAspectRatio: false,
    // Long lists redraw often enough that the animation becomes a drag.
    animation: { duration: items.length > 30 ? 0 : 500 },
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
      const result = await save(`delete "${tab.name}"`, () => state.store.deleteTab(tab.id));
      if (!result.ok) return;

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
    const result = await save(`rename that list to "${name}"`, () =>
      state.store.updateTab(id, { name }),
    );
    if (!result.ok) return;

    state.tabs.find((tab) => tab.id === id).name = name;
    renderTabs();
    renderItems();
  });

  el('add-tab').addEventListener('click', async () => {
    const name = prompt('What should this list be called?');
    if (!name?.trim()) return;

    const result = await save(`make the "${name.trim()}" list`, () =>
      state.store.createTab(
        name.trim(),
        PALETTE[state.tabs.length % PALETTE.length],
        state.tabs.length,
      ),
    );
    if (!result.ok) return;

    state.tabs.push(result.value);
    await selectTab(result.value.id);
  });

  el('add-item').addEventListener('submit', async (event) => {
    event.preventDefault();
    const field = el('new-item');
    const button = el('add-item').querySelector('button');
    const name = field.value.trim();
    if (!name || !state.activeTabId || button.disabled) return;

    // Locked while the save is in flight. Without this, a slow connection
    // invites repeat clicks and each one inserts another duplicate row.
    button.disabled = true;
    button.textContent = 'Saving…';

    const result = await save(`add "${name}"`, () =>
      state.store.createItem(state.activeTabId, name, nextSortOrder()),
    );

    button.disabled = false;
    button.textContent = 'Add';

    if (!result.ok) {
      field.focus();
      return;
    }

    state.items.push(result.value);
    state.history.push({ item_id: result.value.id, count: 0, recorded_at: result.value.created_at });
    field.value = '';
    renderItems();
    renderChart();
    field.focus();
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
      const item = state.items.find((row) => row.id === id);
      const result = await save(`remove ${item.name}`, () => state.store.deleteItem(id));
      if (!result.ok) return;

      state.items = state.items.filter((row) => row.id !== id);
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
      const result = await save(`rename to "${name}"`, () =>
        state.store.updateItem(id, { name }),
      );
      if (!result.ok) return;
      state.items.find((item) => item.id === id).name = name;
      renderChart();
    }

    if (event.target.classList.contains('item-note')) {
      const note = event.target.value.trim() || null;
      const result = await save('save that note', () => state.store.updateItem(id, { note }));
      if (!result.ok) return;
      state.items.find((item) => item.id === id).note = note;
    }
  });

  el('chart-picker').addEventListener('change', (event) => {
    state.chartType = event.target.value;
    localStorage.setItem('theas-inventory:chart', state.chartType);
    renderChart();
  });

  el('chart-limit').addEventListener('change', (event) => {
    state.chartLimit = Number(event.target.value);
    localStorage.setItem('theas-inventory:limit', String(state.chartLimit));
    renderChart();
  });

  el('report-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.activeTabId) return;

    const button = el('report-form').querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Saving…';

    const result = await save('save that report', () =>
      state.store.createReport({
        tab_id: state.activeTabId,
        subject: el('report-subject').value.trim() || null,
        author: el('report-author').value.trim() || null,
        notes: el('report-notes').value.trim() || null,
      }),
    );

    button.disabled = false;
    button.textContent = 'Save report';
    if (!result.ok) return;

    state.reports.unshift(result.value);
    renderReports();
    showToast('Report saved!');
  });

  el('report-list').addEventListener('click', async (event) => {
    if (!event.target.classList.contains('row-kill')) return;
    const id = event.target.closest('li').dataset.id;
    const result = await save('delete that report', () => state.store.deleteReport(id));
    if (!result.ok) return;

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
  const storedType = localStorage.getItem('theas-inventory:chart');
  if (CHART_TYPES.some((type) => type.id === storedType)) state.chartType = storedType;
  el('chart-picker').value = state.chartType;

  const storedLimit = localStorage.getItem('theas-inventory:limit');
  if (storedLimit !== null) state.chartLimit = Number(storedLimit);
  el('chart-limit').value = String(state.chartLimit);

  wireEvents();

  const seeded = await save('load your lists', () => seedIfEmpty(state.store, PALETTE));
  if (!seeded.ok) return;
  state.tabs = seeded.value;

  const remembered = localStorage.getItem('theas-inventory:tab');
  const initial = state.tabs.some((tab) => tab.id === remembered) ? remembered : state.tabs[0]?.id;

  await selectTab(initial ?? null);
}

start();
