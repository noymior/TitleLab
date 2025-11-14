// assets/app-title.js
// 标题管理主逻辑（完整版本）

console.log('app-title.js loaded');

// --------- 0. 全局状态 ---------

const supabase = window.supabaseClient || null;

const DEFAULT_CATEGORIES = ['全部', '亲子', '情侣', '闺蜜', '单人', '烟花', '夜景'];
const CATEGORY_LS_KEY = 'title_categories_v1';
const SNAPSHOT_TABLE = 'title_snapshots';
const SNAPSHOT_DEFAULT_KEY = 'default';

const state = {
  titles: [],
  categories: [...DEFAULT_CATEGORIES],
  currentCategory: '全部',
  filters: {
    search: '',
    scene: ''
  },
  editingId: null,
  viewSettings: {}
};

let toastTimer = null;

// --------- 1. 初始化入口 ---------

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded, init title page');

  loadCategoriesFromLocal();
  renderCategoryList();
  bindCategoryButtons();

  bindToolbar();
  bindTitleModal();
  bindImportModal();
  bindCloudButtons();
  bindGlobalNavButtons();

  if (!supabase) {
    console.warn('supabaseClient 不存在，云端相关功能会不可用');
  }

  loadTitlesFromCloud();
});

// --------- 2. 分类逻辑 ---------

function loadCategoriesFromLocal() {
  const raw = localStorage.getItem(CATEGORY_LS_KEY);
  if (!raw) {
    state.categories = [...DEFAULT_CATEGORIES];
    return;
  }
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) {
      state.categories = [...DEFAULT_CATEGORIES];
    } else {
      const set = new Set(arr);
      set.delete('全部');
      state.categories = ['全部', ...set];
    }
  } catch (e) {
    console.error('loadCategories error', e);
    state.categories = [...DEFAULT_CATEGORIES];
  }
}

function saveCategoriesToLocal() {
  localStorage.setItem(CATEGORY_LS_KEY, JSON.stringify(state.categories));
}

function renderCategoryList() {
  const list = document.getElementById('categoryList');
  if (!list) return;

  list.innerHTML = '';
  state.categories.forEach((cat) => {
    const li = document.createElement('li');
    li.className =
      'category-item' + (cat === state.currentCategory ? ' active' : '');
    li.textContent = cat;
    li.dataset.cat = cat;
    li.addEventListener('click', () => {
      state.currentCategory = cat;
      renderCategoryList();
      renderTitles();
    });
    list.appendChild(li);
  });
}

function bindCategoryButtons() {
  const btnAdd = document.getElementById('btnAddCategory');
  const btnDelete = document.getElementById('btnDeleteCategory');

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      const name = prompt('请输入新分类名称：');
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      if (trimmed === '全部') {
        showToast('不能使用“全部”作为分类名', 'error');
        return;
      }
      if (state.categories.includes(trimmed)) {
        showToast('该分类已存在', 'error');
        return;
      }
      state.categories.push(trimmed);
      saveCategoriesToLocal();
      renderCategoryList();
      showToast('已新增分类：' + trimmed);
    });
  }

  if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
      const cat = state.currentCategory;
      if (cat === '全部') {
        showToast('不能删除“全部”分类', 'error');
        return;
      }
      if (!state.categories.includes(cat)) {
        showToast('当前分类不存在', 'error');
        return;
      }
      if (!confirm(`确定删除分类「${cat}」？`)) return;

      state.categories = state.categories.filter((c) => c !== cat);
      saveCategoriesToLocal();
      state.currentCategory = '全部';
      renderCategoryList();

      if (supabase) {
        try {
          await supabase
            .from('titles')
            .update({ main_category: null })
            .eq('main_category', cat);
        } catch (e) {
          console.error('delete category update titles error', e);
        }
      }

      await loadTitlesFromCloud();
      showToast('分类已删除');
    });
  }
}

// --------- 3. 工具栏：搜索 / 场景筛选 / 按钮 ---------

function bindToolbar() {
  const searchInput = document.getElementById('searchInput');
  const filterScene = document.getElementById('filterScene');

  const btnNewTitle = document.getElementById('btnNewTitle');
  const btnBatchImport = document.getElementById('btnBatchImport');
  const btnClearAll = document.getElementById('btnClearAll');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.filters.search = e.target.value.trim();
      renderTitles();
    });
  }

  if (filterScene) {
    filterScene.addEventListener('change', (e) => {
      state.filters.scene = e.target.value;
      renderTitles();
    });
  }

  if (btnNewTitle) {
    btnNewTitle.addEventListener('click', () => openTitleModal());
  }

  if (btnBatchImport) {
    btnBatchImport.addEventListener('click', () => openImportModal());
  }

  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (!confirm('确定清空全部标题？此操作不可恢复')) return;
      if (!supabase) {
        showToast('Supabase 未配置，无法清空云端', 'error');
        return;
      }
      try {
        await supabase.from('titles').delete().neq('id', null);
        state.titles = [];
        renderTitles();
        showToast('已清空全部标题');
      } catch (e) {
        console.error('clear all error', e);
        showToast('清空失败', 'error');
      }
    });
  }
}

// --------- 4. 加载 & 渲染标题列表 ---------

async function loadTitlesFromCloud() {
  if (!supabase) {
    console.warn('supabaseClient 不存在，跳过云端加载');
    return;
  }
  try {
    const { data, error } = await supabase
      .from('titles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    state.titles = data || [];
    renderTitles();
  } catch (e) {
    console.error('loadTitlesFromCloud error', e);
    showToast('加载标题失败', 'error');
  }
}

function applyFilters(list) {
  const cat = state.currentCategory;
  const q = state.filters.search.toLowerCase();
  const scene = state.filters.scene;

  return list.filter((item) => {
    if (cat !== '全部' && item.main_category !== cat) return false;

    if (q && !(item.text || '').toLowerCase().includes(q)) return false;

    if (scene) {
      const tags = Array.isArray(item.scene_tags) ? item.scene_tags : [];
      if (!tags.includes(scene)) return false;
    }

    return true;
  });
}

function renderTitles() {
  const tbody = document.getElementById('titleTableBody');
  const mobileList = document.getElementById('mobileList');
  if (!tbody || !mobileList) return;

  // 清空原有内容
  tbody.innerHTML = '';
  mobileList.innerHTML = '';

  const list = applyFilters(state.titles);

  list.forEach((item, index) => {
    // ---------- 桌面端行 ----------
    const tr = document.createElement('tr');

    // # 序号
    const tdIndex = document.createElement('td');
    tdIndex.textContent = index + 1;
    tr.appendChild(tdIndex);

    // 标题
    const tdText = document.createElement('td');
    tdText.textContent = item.text || '';
    tr.appendChild(tdText);

    // 主分类
    const tdCat = document.createElement('td');
    tdCat.textContent = item.main_category || '';
    tr.appendChild(tdCat);

    // 使用次数
    const tdUsage = document.createElement('td');
    tdUsage.className = 'text-center';
    tdUsage.textContent = item.usage_count || 0;
    tr.appendChild(tdUsage);

    // ✅ 操作按钮（复制 / 修改 / 删除）
    const tdActions = document.createElement('td');
    tdActions.className = 'actions-cell';

    const group = document.createElement('div');
    group.className = 'action-group';

    const btnCopy = document.createElement('button');
    btnCopy.className = 'function-btn ghost text-xs';
    btnCopy.textContent = '复制';
    btnCopy.addEventListener('click', () => copyTitle(item));

    const btnEdit = document.createElement('button');
    btnEdit.className = 'function-btn ghost text-xs';
    btnEdit.textContent = '修改';
    btnEdit.addEventListener('click', () => openTitleModal(item));

    const btnDel = document.createElement('button');
    btnDel.className = 'function-btn ghost text-xs';
    btnDel.textContent = '删除';
    btnDel.addEventListener('click', () => deleteTitle(item));

    group.append(btnCopy, btnEdit, btnDel);
    tdActions.appendChild(group);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);

    // ---------- 移动端卡片 ----------
    const card = document.createElement('div');
    card.className = 'panel mobile-card';

    const cTitle = document.createElement('div');
    cTitle.className = 'text-sm font-medium mb-1';
    cTitle.textContent = item.text || '';

    const cMeta = document.createElement('div');
    cMeta.className = 'text-xs text-gray-500 mb-2';
    cMeta.textContent = item.main_category
      ? '[' + item.main_category + ']'
      : '[未分类]';

    const actions = document.createElement('div');
    actions.className = 'flex gap-2';

    const mCopy = document.createElement('button');
    mCopy.className = 'function-btn ghost text-xs';
    mCopy.textContent = '复制';
    mCopy.addEventListener('click', () => copyTitle(item));

    const mEdit = document.createElement('button');
    mEdit.className = 'function-btn ghost text-xs';
    mEdit.textContent = '修改';
    mEdit.addEventListener('click', () => openTitleModal(item));

    const mDel = document.createElement('button');
    mDel.className = 'function-btn ghost text-xs';
    mDel.textContent = '删除';
    mDel.addEventListener('click', () => deleteTitle(item));

    actions.append(mCopy, mEdit, mDel);
    card.append(cTitle, cMeta, actions);

    mobileList.appendChild(card);
  });

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-xs text-gray-500 py-2';
    empty.textContent = '暂无标题，请先新增。';
    mobileList.appendChild(empty);
  }
}



// --------- 5. 标题操作：复制 / 删除 ---------

async function copyTitle(item) {
  try {
    await navigator.clipboard.writeText(item.text || '');
    showToast('已复制');
  } catch (e) {
    console.error('copy error', e);
    showToast('复制失败', 'error');
  }

  if (!supabase || !item.id) return;

  try {
    await supabase
      .from('titles')
      .update({ usage_count: (item.usage_count || 0) + 1 })
      .eq('id', item.id);
    await loadTitlesFromCloud();
  } catch (e) {
    console.error('update usage_count error', e);
  }
}

async function deleteTitle(item) {
  if (!confirm('确定删除该标题？')) return;
  if (!supabase || !item.id) return;

  try {
    await supabase.from('titles').delete().eq('id', item.id);
    showToast('已删除');
    await loadTitlesFromCloud();
  } catch (e) {
    console.error('deleteTitle error', e);
    showToast('删除失败', 'error');
  }
}

// --------- 6. 标题弹窗：打开 / 保存 / 关闭 ---------

function bindTitleModal() {
  const btnClose = document.getElementById('btnCloseModal');
  const btnCancel = document.getElementById('btnCancelModal');
  const btnSave = document.getElementById('btnSaveTitle');

  if (btnClose) btnClose.addEventListener('click', closeTitleModal);
  if (btnCancel) btnCancel.addEventListener('click', closeTitleModal);
  if (btnSave) btnSave.addEventListener('click', saveTitleFromModal);
}

function openTitleModal(item) {
  const modal = document.getElementById('titleModal');
  const titleEl = document.getElementById('titleModalTitle');
  const fieldText = document.getElementById('fieldText');
  const fieldCat = document.getElementById('fieldMainCategory');
  const fieldType = document.getElementById('fieldContentType');
  const fieldScene = document.getElementById('fieldSceneTags');

  if (!modal || !titleEl || !fieldText || !fieldCat || !fieldType || !fieldScene) {
    console.error('title modal elements missing');
    return;
  }

  // 填充分类下拉（不含“全部”）
  fieldCat.innerHTML = '';
  state.categories
    .filter((c) => c !== '全部')
    .forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      fieldCat.appendChild(opt);
    });

  if (item) {
    state.editingId = item.id;
    titleEl.textContent = '修改标题';
    fieldText.value = item.text || '';
    fieldCat.value = item.main_category || '';
    fieldType.value = item.content_type || '';
    fieldScene.value = Array.isArray(item.scene_tags)
      ? item.scene_tags.join(', ')
      : '';
  } else {
    state.editingId = null;
    titleEl.textContent = '新增标题';
    fieldText.value = '';
    fieldCat.value =
      state.currentCategory !== '全部' ? state.currentCategory : '';
    fieldType.value = '';
    fieldScene.value = '';
  }

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closeTitleModal() {
  const modal = document.getElementById('titleModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

async function saveTitleFromModal() {
  const fieldText = document.getElementById('fieldText');
  const fieldCat = document.getElementById('fieldMainCategory');
  const fieldType = document.getElementById('fieldContentType');
  const fieldScene = document.getElementById('fieldSceneTags');

  if (!fieldText || !fieldCat || !fieldType || !fieldScene) return;

  const text = fieldText.value.trim();
  const cat = fieldCat.value || null;
  const type = fieldType.value || null;
  const sceneRaw = fieldScene.value.trim();

  if (!text) {
    showToast('标题不能为空', 'error');
    return;
  }

  const sceneTags = sceneRaw
    ? sceneRaw.split(/[，,、]/).map((s) => s.trim()).filter(Boolean)
    : [];

  const payload = {
    text,
    main_category: cat,
    content_type: type,
    scene_tags: sceneTags
  };

  if (!supabase) {
    showToast('Supabase 未配置，无法保存', 'error');
    return;
  }

  try {
    if (state.editingId) {
      await supabase.from('titles').update(payload).eq('id', state.editingId);
    } else {
      await supabase.from('titles').insert(payload);
    }
    closeTitleModal();
    showToast('已保存');
    await loadTitlesFromCloud();
  } catch (e) {
    console.error('saveTitleFromModal error', e);
    showToast('保存失败', 'error');
  }
}

// --------- 7. 批量导入弹窗 ---------

function bindImportModal() {
  const btnClose = document.getElementById('btnCloseImport');
  const btnCancel = document.getElementById('btnCancelImport');
  const btnRun = document.getElementById('btnRunImport');

  if (btnClose) btnClose.addEventListener('click', closeImportModal);
  if (btnCancel) btnCancel.addEventListener('click', closeImportModal);
  if (btnRun) btnRun.addEventListener('click', runImport);
}

function openImportModal() {
  const modal = document.getElementById('importModal');
  const input = document.getElementById('importRawInput');
  const preview = document.getElementById('importPreview');
  if (!modal) return;
  if (input) input.value = '';
  if (preview) preview.innerHTML = '';
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closeImportModal() {
  const modal = document.getElementById('importModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

async function runImport() {
  const input = document.getElementById('importRawInput');
  if (!input) return;

  const raw = input.value.trim();
  if (!raw) {
    showToast('请输入要导入的标题', 'error');
    return;
  }

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    showToast('没有有效的行', 'error');
    return;
  }

  const currentCat =
    state.currentCategory !== '全部' ? state.currentCategory : null;

  const payloads = lines.map((text) => ({
    text,
    main_category: currentCat,
    content_type: null,
    scene_tags: []
  }));

  if (!supabase) {
    showToast('Supabase 未配置，无法导入', 'error');
    return;
  }

  try {
    await supabase.from('titles').insert(payloads);
    closeImportModal();
    showToast('导入完成');
    await loadTitlesFromCloud();
  } catch (e) {
    console.error('runImport error', e);
    showToast('导入失败', 'error');
  }
}

// --------- 8. 云端快照：保存 / 加载 / 列表 ---------

function collectSnapshotPayload() {
  return {
    ver: 1,
    snapshot_label: '',
    updated_at: Date.now(),
    titles: state.titles,
    categories: state.categories,
    viewSettings: state.viewSettings
  };
}

function applySnapshotPayload(payload) {
  if (!payload) return;
  state.titles = Array.isArray(payload.titles) ? payload.titles : [];
  state.categories = Array.isArray(payload.categories)
    ? payload.categories
    : [...DEFAULT_CATEGORIES];
  state.viewSettings = payload.viewSettings || {};

  saveCategoriesToLocal();
  renderCategoryList();
  renderTitles();
}

async function saveCloudSnapshot() {
  if (!supabase) {
    alert('未配置 Supabase');
    return;
  }

  let payload = collectSnapshotPayload();
  const name = prompt('请输入快照名称：');
  if (!name) return;

  payload.snapshot_label = name.trim() || '快照';
  payload.updated_at = Date.now();
  const nowIso = new Date(payload.updated_at).toISOString();

  try {
    await supabase
      .from(SNAPSHOT_TABLE)
      .upsert({
        key: SNAPSHOT_DEFAULT_KEY,
        payload,
        updated_at: nowIso
      });

    const histKey = 'snap_' + payload.updated_at;
    await supabase.from(SNAPSHOT_TABLE).insert({
      key: histKey,
      payload,
      updated_at: nowIso
    });

    showToast('已保存到云端');
    await renderCloudHistoryList();
  } catch (e) {
    console.error('saveCloudSnapshot error', e);
    alert('保存云端失败：' + (e.message || String(e)));
  }
}

async function renderCloudHistoryList() {
  const panel = document.getElementById('cloudHistoryPanel');
  if (!panel) return;

  if (!supabase) {
    panel.innerHTML =
      '<div style="padding:8px 10px;color:#888;">未配置 Supabase</div>';
    return;
  }

  try {
    const { data, error } = await supabase
      .from(SNAPSHOT_TABLE)
      .select('key,payload,updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    if (!Array.isArray(data) || data.length === 0) {
      panel.innerHTML =
        '<div style="padding:8px 10px;color:#888;">暂无云端快照</div>';
      return;
    }

    let html = '';

    data.forEach((row) => {
      const t = new Date(row.updated_at).toLocaleString('zh-CN', {
        hour12: false
      });
      const label =
        (row.payload && row.payload.snapshot_label) || row.key;
      const count = Array.isArray(row.payload?.titles)
        ? row.payload.titles.length
        : 0;

      html += `
        <div class="cloud-item" data-key="${row.key}">
          <div class="cloud-item-main">
            <div class="cloud-item-name">${label}</div>
            <div class="cloud-item-meta">${count} 条标题</div>
          </div>
          <div class="cloud-item-time">${t}</div>
        </div>
      `;
    });

    panel.innerHTML = html;

    panel.querySelectorAll('.cloud-item').forEach((el) => {
      el.addEventListener('click', async () => {
        const key = el.getAttribute('data-key');
        if (!key) return;
        const ok = confirm('确定使用此快照覆盖当前数据？');
        if (!ok) return;
        await loadCloudSnapshot(key);
      });
    });
  } catch (e) {
    console.error('renderCloudHistoryList error', e);
    panel.innerHTML =
      '<div style="padding:8px 10px;color:#f43f5e;">加载云端快照失败</div>';
  }
}

async function loadCloudSnapshot(key) {
  if (!supabase) {
    alert('未配置 Supabase');
    return;
  }
  try {
    const { data, error } = await supabase
      .from(SNAPSHOT_TABLE)
      .select('payload')
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;
    if (!data || !data.payload) {
      alert('找不到该快照');
      return;
    }

    applySnapshotPayload(data.payload);
    showToast('云端数据已加载');
    const panel = document.getElementById('cloudHistoryPanel');
    if (panel) {
      panel.classList.add('hidden');
      panel.style.display = 'none';
    }
  } catch (e) {
    console.error('loadCloudSnapshot error', e);
    alert('加载云端失败：' + (e.message || String(e)));
  }
}

async function toggleCloudHistoryPanel() {
  const panel = document.getElementById('cloudHistoryPanel');
  if (!panel) return;

  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    panel.style.display = 'block';
    await renderCloudHistoryList();
  } else {
    panel.classList.add('hidden');
    panel.style.display = 'none';
  }
}

function bindCloudButtons() {
  const btnSave = document.getElementById('btnSaveCloud');
  const btnLoad = document.getElementById('btnLoadCloud');

  if (btnSave) btnSave.addEventListener('click', saveCloudSnapshot);
  if (btnLoad) btnLoad.addEventListener('click', toggleCloudHistoryPanel);
}

// --------- 9. 管理页面 / 设置页面 占位 ---------

function bindGlobalNavButtons() {
  const btnSettings = document.getElementById('btnSettings');
  const btnManage = document.getElementById('btnManagePage');

  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      // 先占位，后续你可以做真正的设置页面
      alert('设置页面（占位中，后续单独实现 settings.html）');
    });
  }

  if (btnManage) {
    btnManage.addEventListener('click', () => {
      // 同样先占位
      alert('管理页面（占位中，后续对接 admin.html / 用户管理等）');
    });
  }
}

// --------- 10. Toast ---------

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) {
    alert(msg);
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.background =
    type === 'error' ? 'rgba(220,38,38,0.92)' : 'rgba(17,24,39,0.92)';

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, 1800);
}

// 让 HTML 里的 onclick 能调用到
window.openTitleModal = openTitleModal;
window.openImportModal = openImportModal;
