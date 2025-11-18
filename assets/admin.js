const supabase = window.supabaseClient || null;

let toastTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (!user) { window.location.href = 'login.html'; return; }
  const badge = document.getElementById('currentUserName');
  if (badge) badge.textContent = user.username;
  const btnLogout = document.getElementById('btnLogout');
  const btnLoginHeader = document.getElementById('btnLoginHeader');
  if (btnLogout) btnLogout.onclick = () => { try { localStorage.removeItem('current_user_v1'); } catch (_) {} window.location.href = 'login.html'; };
  if (btnLoginHeader) btnLoginHeader.onclick = () => { window.location.href = 'login.html'; };
  if (btnLogout) btnLogout.classList.remove('hidden');
  if (btnLoginHeader) btnLoginHeader.classList.add('hidden');
  bindOverview();
  bindSnapshotControls();
  bindDataOps();
  bindCategoryOps();
  bindDangerOps();
});

function getCurrentUser() {
  try { const raw = localStorage.getItem('current_user_v1'); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}

let snapshotQuery = '';
let snapshotPage = 1;
const SNAPSHOT_PAGE_SIZE = 10;
let snapshotOpen = false;

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.background = type === 'error' ? 'rgba(220,38,38,0.92)' : 'rgba(17,24,39,0.92)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add('hidden'); }, 1800);
}

async function fetchAll(table) {
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
}

function bindOverview() {
  renderOverview();
}

async function renderOverview() {
  const titles = await fetchAll('titles');
  const contents = await fetchAll('contents');
  const elT = document.getElementById('overviewTitleCount');
  const elC = document.getElementById('overviewContentCount');
  const elS = document.getElementById('overviewLatestSnapshot');
  if (elT) elT.textContent = Array.isArray(titles) ? titles.length : 0;
  if (elC) elC.textContent = Array.isArray(contents) ? contents.length : 0;
  let latest = '—';
  if (window.snapshotService) {
    try {
      const list = await window.snapshotService.listUnified(1);
      if (list && list.length) {
        latest = `${list[0].label} · 标题 ${list[0].titleCount} · 文案 ${list[0].contentCount} · ${list[0].updatedText}`;
      }
    } catch (_) {}
  }
  if (elS) elS.textContent = latest;
}

function bindSnapshotControls() {
  const btnSave = document.getElementById('btnSaveUnifiedSnapshot');
  const btnToggle = document.getElementById('btnToggleSnapshots');
  const inputSearch = document.getElementById('snapshotSearchInput');
  const btnPrev = document.getElementById('snapshotPrev');
  const btnNext = document.getElementById('snapshotNext');
  if (btnSave) btnSave.addEventListener('click', async () => {
    if (!window.snapshotService) { showToast('未配置 Supabase', 'error'); return; }
    const label = prompt('请输入快照备注：', '');
    if (label === null) return;
    try {
      const info = await window.snapshotService.saveUnifiedSnapshotFromCloud(label.trim());
      showToast(`已保存：标题 ${info.titleCount} 文案 ${info.contentCount} ${info.updatedText}`);
      renderOverview();
    } catch (e) {
      showToast('保存失败', 'error');
    }
  });
  if (btnToggle) btnToggle.addEventListener('click', () => {
    const box = document.getElementById('snapshotList');
    if (!snapshotOpen) {
      renderSnapshotList();
      snapshotOpen = true;
      btnToggle.classList.remove('ghost');
    } else {
      if (box) box.innerHTML = '';
      snapshotOpen = false;
      btnToggle.classList.add('ghost');
    }
  });
  if (inputSearch) inputSearch.addEventListener('input', debounce((e) => {
    snapshotQuery = (e.target.value || '').trim();
    snapshotPage = 1;
    renderSnapshotList();
  }, 300));
  if (btnPrev) btnPrev.addEventListener('click', () => { if (snapshotPage > 1) { snapshotPage--; renderSnapshotList(); } });
  if (btnNext) btnNext.addEventListener('click', () => { snapshotPage++; renderSnapshotList(); });
}

async function renderSnapshotList() {
  const box = document.getElementById('snapshotList');
  if (!box) return;
  box.innerHTML = '加载中…';
  if (!window.snapshotService) { box.textContent = '未配置 Supabase'; return; }
  try {
    const list = await window.snapshotService.listUnified(100);
    if (!list || !list.length) { box.textContent = '暂无快照'; return; }
    const filtered = snapshotQuery ? list.filter((it) => String(it.label || '').includes(snapshotQuery)) : list;
    const totalPages = Math.max(1, Math.ceil(filtered.length / SNAPSHOT_PAGE_SIZE));
    if (snapshotPage > totalPages) snapshotPage = totalPages;
    const start = (snapshotPage - 1) * SNAPSHOT_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + SNAPSHOT_PAGE_SIZE);
    box.innerHTML = '';
    pageItems.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'cloud-item';
      row.innerHTML = `
        <div class="cloud-item-main">
          <div class="cloud-item-name">${it.label}</div>
          <div class="cloud-item-meta">标题 ${it.titleCount} 条 · 文案 ${it.contentCount} 条 · ${it.updatedText}</div>
        </div>
        <div class="cloud-item-actions">
          <button class="function-btn ghost text-xs">加载</button>
          <button class="function-btn ghost text-xs">删除</button>
        </div>
      `;
      const btns = row.querySelectorAll('.function-btn');
      if (btns[0]) btns[0].addEventListener('click', async () => {
        const ok = confirm('确定使用此快照覆盖当前数据？');
        if (!ok) return;
        try {
          const info = await window.snapshotService.loadUnifiedSnapshot(it.key, 'both');
          showToast(`已加载：标题 ${info.titleCount} 文案 ${info.contentCount} ${info.updatedText}`);
          renderOverview();
        } catch (e) {
          showToast('加载失败', 'error');
        }
      });
      if (btns[1]) btns[1].addEventListener('click', async () => {
        if (!supabase) return;
        const ok = confirm('确定删除该快照？');
        if (!ok) return;
        try {
          await supabase.from('snapshots').delete().eq('key', it.key);
          renderSnapshotList();
          showToast('已删除');
        } catch (_) {
          showToast('删除失败', 'error');
        }
      });
      box.appendChild(row);
    });
    const pagerInfo = document.createElement('div');
    pagerInfo.className = 'text-xs text-gray-500 mt-2';
    pagerInfo.textContent = `共 ${filtered.length} 条 · 第 ${snapshotPage}/${totalPages} 页`;
    box.appendChild(pagerInfo);
    snapshotOpen = true;
  } catch (e) {
    box.textContent = '加载失败';
  }
}

function bindDataOps() {
  const btnExT = document.getElementById('btnExportTitlesCsv');
  const btnExC = document.getElementById('btnExportContentsCsv');
  const btnExTJson = document.getElementById('btnExportTitlesJson');
  const btnExCJson = document.getElementById('btnExportContentsJson');
  const btnDedupT = document.getElementById('btnDedupTitles');
  const btnDedupC = document.getElementById('btnDedupContents');
  const btnNormT = document.getElementById('btnNormalizeTitles');
  const btnNormC = document.getElementById('btnNormalizeContents');
  if (btnExT) btnExT.addEventListener('click', () => exportCsv('titles'));
  if (btnExC) btnExC.addEventListener('click', () => exportCsv('contents'));
  if (btnExTJson) btnExTJson.addEventListener('click', () => exportJson('titles'));
  if (btnExCJson) btnExCJson.addEventListener('click', () => exportJson('contents'));
  if (btnDedupT) btnDedupT.addEventListener('click', () => dedupTable('titles'));
  if (btnDedupC) btnDedupC.addEventListener('click', () => dedupTable('contents'));
  if (btnNormT) btnNormT.addEventListener('click', () => normalizeText('titles'));
  if (btnNormC) btnNormC.addEventListener('click', () => normalizeText('contents'));
}

async function exportCsv(table) {
  const rows = await fetchAll(table);
  const header = ['text','main_category','content_type','scene_tags','usage_count','created_at'];
  const csv = [header.join(',')].concat(rows.map((r) => {
    const scene = Array.isArray(r.scene_tags) ? r.scene_tags.join('|') : '';
    const vals = [r.text || '', r.main_category || '', r.content_type || '', scene, r.usage_count || 0, r.created_at || ''];
    return vals.map((v) => String(v).replace(/"/g, '""')).map((v) => `"${v}"`).join(',');
  })).join('\n');
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${table}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function exportJson(table) {
  const rows = await fetchAll(table);
  const blob = new Blob([JSON.stringify(rows || [], null, 2)], { type: 'application/json;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${table}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function norm(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

async function dedupTable(table) {
  const rows = await fetchAll(table);
  const map = new Map();
  const toDelete = [];
  rows.forEach((r) => {
    const key = norm(r.text).toLowerCase();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, r);
    } else {
      const keep = map.get(key);
      const curTime = new Date(r.created_at || 0).getTime();
      const keepTime = new Date(keep.created_at || 0).getTime();
      if (curTime < keepTime) {
        toDelete.push(keep);
        map.set(key, r);
      } else {
        toDelete.push(r);
      }
    }
  });
  if (!supabase) return;
  let count = 0;
  setProgress(`准备删除重复 ${toDelete.length} 条…`);
  for (const d of toDelete) {
    try { await supabase.from(table).delete().eq('id', d.id); count++; } catch (_) {}
    if (count % 20 === 0) setProgress(`已删除 ${count}/${toDelete.length}`);
  }
  showToast(`已删除重复 ${count} 条`);
  renderOverview();
  setProgress('');
}

async function normalizeText(table) {
  const rows = await fetchAll(table);
  if (!supabase) return;
  let count = 0;
  setProgress(`准备归一化 ${rows.length} 条…`);
  for (const r of rows) {
    const t = norm(r.text);
    if (t !== (r.text || '')) {
      try { await supabase.from(table).update({ text: t }).eq('id', r.id); count++; } catch (_) {}
    }
    if (count % 20 === 0) setProgress(`已归一化 ${count}/${rows.length}`);
  }
  showToast(`已归一化 ${count} 条`);
  renderOverview();
  setProgress('');
}

function bindCategoryOps() {
  const btnA = document.getElementById('btnCopyTitleCatsToContent');
  const btnB = document.getElementById('btnCopyContentCatsToTitle');
  const btnR = document.getElementById('btnResetCatsDefault');
  if (btnA) btnA.addEventListener('click', () => {
    const src = localStorage.getItem('title_categories_v1');
    const arr = src ? JSON.parse(src) : [];
    localStorage.setItem('content_categories_v1', JSON.stringify(arr));
    showToast('已复制到文案分类');
  });
  if (btnB) btnB.addEventListener('click', () => {
    const src = localStorage.getItem('content_categories_v1');
    const arr = src ? JSON.parse(src) : [];
    localStorage.setItem('title_categories_v1', JSON.stringify(arr));
    showToast('已复制到标题分类');
  });
  if (btnR) btnR.addEventListener('click', () => {
    const def = ['全部','亲子','情侣','闺蜜','单人','烟花','夜景'];
    localStorage.setItem('title_categories_v1', JSON.stringify(def));
    localStorage.setItem('content_categories_v1', JSON.stringify(def));
    showToast('分类已重置');
  });
}

function bindDangerOps() {
  const btnCT = document.getElementById('btnClearTitlesAdmin');
  const btnCC = document.getElementById('btnClearContentsAdmin');
  if (btnCT) btnCT.addEventListener('click', async () => {
    if (!supabase) { showToast('未配置 Supabase', 'error'); return; }
    openDangerConfirm('清空标题表将不可恢复，请输入：清空', async () => {
      try {
        const { error } = await supabase.from('titles').delete().not('id', 'is', null);
        if (error) throw error;
        showToast('已清空标题表');
        renderOverview();
      } catch (_) { showToast('清空失败', 'error'); }
    });
  });
  if (btnCC) btnCC.addEventListener('click', async () => {
    if (!supabase) { showToast('未配置 Supabase', 'error'); return; }
    openDangerConfirm('清空文案表将不可恢复，请输入：清空', async () => {
      try {
        const { error } = await supabase.from('contents').delete().not('id', 'is', null);
        if (error) throw error;
        showToast('已清空文案表');
        renderOverview();
      } catch (_) { showToast('清空失败', 'error'); }
    });
  });
}

function openDangerConfirm(text, onOk) {
  const backdrop = document.getElementById('dangerConfirmBackdrop');
  const modal = document.getElementById('dangerConfirmModal');
  const elText = document.getElementById('dangerConfirmText');
  const input = document.getElementById('dangerConfirmInput');
  const btnClose = document.getElementById('dangerConfirmClose');
  const btnCancel = document.getElementById('dangerConfirmCancel');
  const btnOk = document.getElementById('dangerConfirmOk');
  if (!backdrop || !modal || !elText || !input || !btnClose || !btnCancel || !btnOk) return;
  elText.textContent = text;
  input.value = '';
  backdrop.classList.remove('hidden');
  modal.classList.remove('hidden');
  const close = () => { backdrop.classList.add('hidden'); modal.classList.add('hidden'); };
  btnClose.onclick = close;
  btnCancel.onclick = close;
  btnOk.onclick = async () => {
    if ((input.value || '').trim() !== '清空') return;
    close();
    await onOk();
  };
}

function setProgress(msg) {
  const el = document.getElementById('adminProgress');
  if (!el) return;
  el.textContent = msg || '';
}

function debounce(fn, delay) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}