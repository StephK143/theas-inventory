import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const STARTER_TABS = ['Squishys', 'Halloween Candy'];

function supabaseStore(client) {
  const unwrap = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  return {
    mode: 'cloud',

    listTabs: () =>
      client.from('thea_tabs').select('*').order('sort_order').order('created_at').then(unwrap),

    createTab: (name, color, sortOrder) =>
      client
        .from('thea_tabs')
        .insert({ name, color, sort_order: sortOrder })
        .select()
        .single()
        .then(unwrap),

    updateTab: (id, patch) => client.from('thea_tabs').update(patch).eq('id', id).then(unwrap),

    deleteTab: (id) => client.from('thea_tabs').delete().eq('id', id).then(unwrap),

    listItems: (tabId) =>
      client
        .from('thea_items')
        .select('*')
        .eq('tab_id', tabId)
        .order('sort_order')
        .order('created_at')
        .then(unwrap),

    createItem: (tabId, name, sortOrder) =>
      client
        .from('thea_items')
        .insert({ tab_id: tabId, name, sort_order: sortOrder })
        .select()
        .single()
        .then(unwrap),

    updateItem: (id, patch) => client.from('thea_items').update(patch).eq('id', id).then(unwrap),

    deleteItem: (id) => client.from('thea_items').delete().eq('id', id).then(unwrap),

    listHistory: (itemIds) =>
      itemIds.length === 0
        ? Promise.resolve([])
        : client
            .from('thea_count_log')
            .select('*')
            .in('item_id', itemIds)
            .order('recorded_at')
            .then(unwrap),

    listReports: (tabId) =>
      client
        .from('thea_reports')
        .select('*')
        .eq('tab_id', tabId)
        .order('created_at', { ascending: false })
        .then(unwrap),

    createReport: (report) =>
      client.from('thea_reports').insert(report).select().single().then(unwrap),

    deleteReport: (id) => client.from('thea_reports').delete().eq('id', id).then(unwrap),
  };
}

function localStore() {
  const KEY = 'theas-inventory';
  const blank = { tabs: [], items: [], log: [], reports: [] };

  let state;
  try {
    state = { ...blank, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    state = { ...blank };
  }

  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const now = () => new Date().toISOString();
  const clone = (rows) => rows.map((row) => ({ ...row }));
  const bySort = (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

  const logCount = (itemId, count) => {
    state.log.push({ item_id: itemId, count, recorded_at: now() });
  };

  return {
    mode: 'practice',

    listTabs: async () => clone(state.tabs).sort(bySort),

    createTab: async (name, color, sortOrder) => {
      const tab = {
        id: crypto.randomUUID(),
        name,
        color,
        sort_order: sortOrder,
        created_at: now(),
      };
      state.tabs.push(tab);
      save();
      return { ...tab };
    },

    updateTab: async (id, patch) => {
      Object.assign(
        state.tabs.find((tab) => tab.id === id),
        patch,
      );
      save();
    },

    deleteTab: async (id) => {
      const doomed = state.items.filter((item) => item.tab_id === id).map((item) => item.id);
      state.tabs = state.tabs.filter((tab) => tab.id !== id);
      state.items = state.items.filter((item) => item.tab_id !== id);
      state.log = state.log.filter((entry) => !doomed.includes(entry.item_id));
      state.reports = state.reports.filter((report) => report.tab_id !== id);
      save();
    },

    listItems: async (tabId) =>
      clone(state.items.filter((item) => item.tab_id === tabId)).sort(bySort),

    createItem: async (tabId, name, sortOrder) => {
      const item = {
        id: crypto.randomUUID(),
        tab_id: tabId,
        name,
        count: 0,
        note: null,
        sort_order: sortOrder,
        created_at: now(),
        updated_at: now(),
      };
      state.items.push(item);
      logCount(item.id, 0);
      save();
      return { ...item };
    },

    updateItem: async (id, patch) => {
      const item = state.items.find((row) => row.id === id);
      if (patch.count !== undefined && patch.count !== item.count) {
        logCount(id, patch.count);
      }
      Object.assign(item, patch, { updated_at: now() });
      save();
    },

    deleteItem: async (id) => {
      state.items = state.items.filter((item) => item.id !== id);
      state.log = state.log.filter((entry) => entry.item_id !== id);
      save();
    },

    listHistory: async (itemIds) =>
      clone(state.log.filter((entry) => itemIds.includes(entry.item_id))).sort((a, b) =>
        a.recorded_at.localeCompare(b.recorded_at),
      ),

    listReports: async (tabId) =>
      clone(state.reports.filter((report) => report.tab_id === tabId)).sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),

    createReport: async (report) => {
      const saved = { ...report, id: crypto.randomUUID(), created_at: now() };
      state.reports.push(saved);
      save();
      return { ...saved };
    },

    deleteReport: async (id) => {
      state.reports = state.reports.filter((report) => report.id !== id);
      save();
    },
  };
}

export async function openStore() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return localStore();

  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const store = supabaseStore(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    await store.listTabs();
    return store;
  } catch (error) {
    console.error('Falling back to practice mode:', error);
    return { ...localStore(), mode: 'offline' };
  }
}

export async function seedIfEmpty(store, palette) {
  const tabs = await store.listTabs();
  if (tabs.length > 0) return tabs;

  for (const [index, name] of STARTER_TABS.entries()) {
    await store.createTab(name, palette[index % palette.length], index);
  }
  return store.listTabs();
}
