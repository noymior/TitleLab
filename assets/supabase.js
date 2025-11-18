// assets/supabase.js

// 这里直接写死你的 Supabase 项目信息
// （这是 anon 公钥，只能做前端允许的操作，注意不要用 service_role）
const SUPABASE_URL = 'https://ukinuavvsjnqmrbtmwtq.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVraW51YXZ2c2pucW1yYnRtd3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNDgwNzUsImV4cCI6MjA3ODYyNDA3NX0.e4Y9sw_apIhln146rSExKadRAzzO3RoCGqgRh7eIGnI';

// 防御：如果 Supabase SDK 没加载，会在控制台给出提示
if (!window.supabase) {
  console.error('❌ Supabase JS SDK 未加载，请检查 <script> 引用顺序');
}

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ✅ 关键：挂到 window 上，给 app-title.js 使用
window.supabaseClient = supabaseClient;

// 状态检查：右上角的小 pill 提示 Supabase 在线/错误
async function pingSupabase() {
  try {
    const el = document.getElementById('supabaseStatus');
    if (!el || !supabaseClient) return;

    const { error } = await supabaseClient.from('titles').select('id').limit(1);

    if (error) {
      console.error('Supabase error:', error);
      el.textContent = '不在线';
      el.classList.add('pill-muted');
      el.classList.remove('pill');
      el.removeAttribute('style');
    } else {
      el.textContent = '在线';
      el.classList.add('pill-muted');
      el.classList.remove('pill');
      el.removeAttribute('style');
    }
  } catch (e) {
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', pingSupabase);

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch (_) {
    return '';
  }
}

async function fetchTableAll(table) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from(table)
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return [];
  try {
    const raw = localStorage.getItem('current_user_v1');
    const user = raw ? JSON.parse(raw) : null;
    const tag = user ? `user:${user.username}` : null;
    if (!tag) return data || [];
    return (data || []).filter((it) => Array.isArray(it.scene_tags) && it.scene_tags.includes(tag));
  } catch (_) {
    return data || [];
  }
}

async function upsertSnapshot(row) {
  const { error } = await supabaseClient
    .from('snapshots')
    .upsert([row], { onConflict: 'key' });
  if (error) throw error;
}

async function tryListUnifiedSnapshots(limit = 5) {
  if (!supabaseClient) return { rows: [], source: 'none' };
  const { data, error } = await supabaseClient
    .from('snapshots')
    .select('key, payload, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) return { rows: [], source: 'error' };
  return { rows: data || [], source: 'snapshots' };
}

async function tryListTitleSnapshots(limit = 5) {
  if (!supabaseClient) return { rows: [], source: 'none' };
  const { data, error } = await supabaseClient
    .from('title_snapshots')
    .select('key, payload, updated_at')
    .neq('key', 'default')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) return { rows: [], source: 'error' };
  return { rows: data || [], source: 'title_snapshots' };
}

async function clearAndInsert(table, rows) {
  let user = null;
  try { const raw = localStorage.getItem('current_user_v1'); user = raw ? JSON.parse(raw) : null; } catch (_) {}
  const tag = user ? `user:${user.username}` : null;
  if (tag) {
    const { data: existing } = await supabaseClient
      .from(table)
      .select('id, scene_tags');
    const ids = (existing || [])
      .filter((r) => Array.isArray(r.scene_tags) && r.scene_tags.includes(tag))
      .map((r) => r.id);
    if (ids.length) {
      const { error: delError } = await supabaseClient.from(table).delete().in('id', ids);
      if (delError) throw delError;
    }
  } else {
    const { error: delError } = await supabaseClient
      .from(table)
      .delete()
      .not('id', 'is', null);
    if (delError) throw delError;
  }
  if (!rows || rows.length === 0) return;
  const rowsWithTag = tag ? rows.map((r) => ({ ...r, scene_tags: Array.from(new Set([...(r.scene_tags || []), tag])) })) : rows;
  const { error: insError } = await supabaseClient.from(table).insert(rowsWithTag);
  if (insError) throw insError;
}

window.snapshotService = {
  async saveUnifiedSnapshotFromCloud(label, opts = {}) {
    if (!supabaseClient) throw new Error('supabase offline');
    const titles = await fetchTableAll('titles');
    const contents = await fetchTableAll('contents');
    const titleCatsRaw = localStorage.getItem('title_categories_v1');
    const contentCatsRaw = localStorage.getItem('content_categories_v1');
    let titleCats = [];
    let contentCats = [];
    try {
      titleCats = JSON.parse(titleCatsRaw || '[]');
    } catch (_) {}
    try {
      contentCats = JSON.parse(contentCatsRaw || '[]');
    } catch (_) {}
    const viewSettingsRaw = localStorage.getItem('display_settings_v1');
    let viewSettings = {};
    try {
      viewSettings = JSON.parse(viewSettingsRaw || '{}');
    } catch (_) {}
    const payload = {
      ver: 2,
      snapshot_label: label || '',
      updated_at: Date.now(),
      titles,
      contents,
      categories: { title: titleCats, content: contentCats },
      viewSettings
    };
    let user = null;
    try { const raw = localStorage.getItem('current_user_v1'); user = raw ? JSON.parse(raw) : null; } catch (_) {}
    const row = {
      key: `${user ? 'user_'+user.username+'_' : ''}manual_${Date.now()}`,
      payload,
      updated_at: new Date().toISOString()
    };
    await upsertSnapshot(row);
    return {
      titleCount: Array.isArray(titles) ? titles.length : 0,
      contentCount: Array.isArray(contents) ? contents.length : 0,
      updatedText: formatTime(row.updated_at)
    };
  },
  async listUnified(limit = 5) {
    const first = await tryListUnifiedSnapshots(limit);
    if (first.source === 'snapshots' && first.rows.length) {
      return first.rows.map((r) => ({
        key: r.key,
        label: (r.payload && r.payload.snapshot_label) || '(未命名)',
        titleCount: Array.isArray(r.payload && r.payload.titles)
          ? r.payload.titles.length
          : 0,
        contentCount: Array.isArray(r.payload && r.payload.contents)
          ? r.payload.contents.length
          : 0,
        updatedText: formatTime(r.updated_at),
        source: 'snapshots'
      }));
    }
    const fallback = await tryListTitleSnapshots(limit);
    return fallback.rows.map((r) => ({
      key: r.key,
      label: (r.payload && r.payload.snapshot_label) || '(未命名)',
      titleCount: Array.isArray(r.payload && r.payload.titles)
        ? r.payload.titles.length
        : 0,
      contentCount: 0,
      updatedText: formatTime(r.updated_at),
      source: 'title_snapshots'
    }));
  },
  async loadUnifiedSnapshot(key, apply = 'both') {
    if (!supabaseClient) throw new Error('supabase offline');
    let payload = null;
    try {
      const { data } = await supabaseClient
        .from('snapshots')
        .select('payload')
        .eq('key', key)
        .maybeSingle();
      payload = data && data.payload;
    } catch (_) {}
    if (!payload) {
      const { data } = await supabaseClient
        .from('title_snapshots')
        .select('payload')
        .eq('key', key)
        .maybeSingle();
      payload = data && data.payload;
    }
    if (!payload) throw new Error('snapshot not found');
    const titles = Array.isArray(payload.titles) ? payload.titles : [];
    const contents = Array.isArray(payload.contents) ? payload.contents : [];
    if (apply === 'both' || apply === 'title') {
      await clearAndInsert(
        'titles',
        titles.map((t) => ({
          text: t.text,
          main_category: t.main_category || null,
          content_type: t.content_type || null,
          scene_tags: Array.isArray(t.scene_tags) ? t.scene_tags : [],
          usage_count: t.usage_count || 0,
          created_at: t.created_at || new Date().toISOString()
        }))
      );
    }
    if (apply === 'both' || apply === 'content') {
      await clearAndInsert(
        'contents',
        contents.map((c) => ({
          text: c.text,
          main_category: c.main_category || null,
          content_type: c.content_type || null,
          scene_tags: Array.isArray(c.scene_tags) ? c.scene_tags : [],
          usage_count: c.usage_count || 0,
          created_at: c.created_at || new Date().toISOString()
        }))
      );
    }
    if (payload.categories && payload.categories.title) {
      localStorage.setItem(
        'title_categories_v1',
        JSON.stringify(payload.categories.title)
      );
    }
    if (payload.categories && payload.categories.content) {
      localStorage.setItem(
        'content_categories_v1',
        JSON.stringify(payload.categories.content)
      );
    }
    return {
      titleCount: titles.length,
      contentCount: contents.length,
      updatedText: formatTime(payload.updated_at || Date.now())
    };
  }
};
