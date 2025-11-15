// assets/app-title.js
// 标题管理主逻辑（桌面表格 + 手机卡片）

console.log('[TitleApp] app-title.js loaded');

// --------- 0. 全局状态 ---------

const supabase = window.supabaseClient || null;

const DEFAULT_CATEGORIES = ['全部', '亲子', '情侣', '闺蜜', '单人', '烟花', '夜景'];
const CATEGORY_LS_KEY = 'title_categories_v1';

const SNAPSHOT_TABLE = 'title_snapshots';
const SNAPSHOT_DEFAULT_KEY = 'default';

const state = {
  titles: [], // 当前所有标题记录
  categories: [...DEFAULT_CATEGORIES],
  currentCategory: '全部',
  filters: {
    search: '',
    scene: ''
  },
  editingId: null,
  viewSettings: {},
  isSortingCategories: false // 分类是否处在排序模式
};

let toastTimer = null;

// --------- 1. 初始化入口 ---------

document.addEventListener('DOMContentLoaded', () => {
  console.log('[TitleApp] DOMContentLoaded: init');

  loadCategoriesFromLocal();
  renderCategoryList();
  bindCategoryButtons();
  setupMobileCategoryDropdown();

  bindToolbar();
  bindTitleModal();
  bindImportModal();
  bindCloudButtons();
  bindGlobalNavButtons();

  if (!supabase) {
    console.warn('[TitleApp] supabaseClient 不存在，云端功能不可用');
  } else {
    console.log('[TitleApp] supabaseClient 已就绪');
  }

  // 初始从云端加载一遍
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
    console.error('[TitleApp] loadCategoriesFromLocal error', e);
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

  state.categories.forEach((cat, index) => {
    const li = document.createElement('li');
    li.className =
      'category-item' + (cat === state.currentCategory ? ' active' : '');
    li.dataset.cat = cat;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = cat;
    li.appendChild(nameSpan);

    // 排序模式下：给非“全部”增加上下按钮
    if (state.isSortingCategories && cat !== '全部') {
      const controls = document.createElement('span');
      controls.style.marginLeft = '8px';

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.textContent = '↑';
      btnUp.className = 'function-btn ghost text-xs btn-inline';
      btnUp.style.paddingInline = '6px';
      btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderCategory(index, -1);
      });

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.textContent = '↓';
      btnDown.className = 'function-btn ghost text-xs btn-inline';
      btnDown.style.marginLeft = '4px';
      btnDown.style.paddingInline = '6px';
      btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderCategory(index, 1);
      });

      controls.appendChild(btnUp);
      controls.appendChild(btnDown);
      li.appendChild(controls);
    }

    // 正常点击：切换当前分类
    li.addEventListener('click', () => {
      state.currentCategory = cat;
      renderCategoryList();
      renderTitles();
    });

    list.appendChild(li);
  });

  updateMobileCategoryLabel();
}

// 分类重新排序：index 当前下标，delta = -1 上移 / +1 下移
function reorderCategory(index, delta) {
  const newIndex = index + delta;

  // 0 是“全部”，不能动；其它分类从 1 开始
  if (index <= 0) return;
  if (newIndex <= 0) return;
  if (newIndex >= state.categories.length) return;

  const arr = [...state.categories];
  const item = arr[index];
  arr.splice(index, 1);
  arr.splice(newIndex, 0, item);
  state.categories = arr;

  saveCategoriesToLocal();
  renderCategoryList();
}

// --------- 2.5 手机端分类下拉 ---------

function setupMobileCategoryDropdown() {
  const wrapper = document.getElementById('mobileCategoryWrapper');
  const toggleBtn = document.getElementById('mobileCategoryToggle');
  const list = document.getElementById('categoryList');

  if (!wrapper || !toggleBtn || !list) return;

  function isMobile() {
    return window.innerWidth < 768;
  }

  function applyVisibility() {
    if (isMobile()) {
      wrapper.style.display = 'block';
      const isOpen = wrapper.getAttribute('data-open') === '1';
      list.style.display = isOpen ? 'block' : 'none';
    } else {
      wrapper.style.display = 'none';
      list.style.display = 'block';
    }
  }

  toggleBtn.addEventListener('click', () => {
    const isOpen = wrapper.getAttribute('data-open') === '1';
    wrapper.setAttribute('data-open', isOpen ? '0' : '1');
    applyVisibility();
  });

  window.addEventListener('resize', applyVisibility);

  applyVisibility();
}

function updateMobileCategoryLabel() {
  const labelEl = document.getElementById('mobileCategoryLabel');
  if (!labelEl) return;
  labelEl.textContent = state.currentCategory || '全部';
}

// --------- 3. 工具栏：搜索 / 场景筛选 / 按钮 ---------

function bindToolbar() {
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const filterScene = document.getElementById('filterScene');

  const btnNewTitle = document.getElementById('btnNewTitle');
  const btnBatchImport = document.getElementById('btnBatchImport');
  const btnClearAll = document.getElementById('btnClearAll');

  // 🔍 搜索 + 清除
  if (searchInput) {
    const syncClearBtn = () => {
      if (!btnClearSearch) return;
      btnClearSearch.style.display = searchInput.value ? 'inline-flex' : 'none';
    };

    searchInput.addEventListener('input', (e) => {
      state.filters.search = e.target.value.trim();
      renderTitles();
      syncClearBtn();
    });

    syncClearBtn();

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        state.filters.search = '';
        renderTitles();
        syncClearBtn();
      });
    }
  }

  if (filterScene) {
    filterScene.addEventListener('change', (e) => {
      state.filters.scene = e.target.value;
      renderTitles();
    });
  }

  if (btnNewTitle) {
    btnNewTitle.addEventListener('click', () => {
      console.log('[TitleApp] 点击 新增标题');
      openTitleModal();
    });
  }

  if (btnBatchImport) {
    btnBatchImport.addEventListener('click', () => {
      console.log('[TitleApp] 点击 批量导入');
      openImportModal();
    });
  }

  // 🗑 清空全部：先云端删，成功才清本地
  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (!confirm('确定清空全部标题？此操作不可恢复')) return;
      if (!supabase) {
        showToast('Supabase 未配置，无法清空云端', 'error');
        return;
      }
      try {
        // 用 .not('id','is',null) 避免 uuid 比较 "null" 报错
        const { error } = await supabase
          .from('titles')
          .delete()
          .not('id', 'is', null);

        if (error) throw error;

        state.titles = [];
        renderTitles();
        showToast('已清空全部标题');
      } catch (e) {
        console.error('[TitleApp] 清空全部失败', e);
        showToast('清空失败： ' + (e.message || ''), 'error');
      }
    });
  }
}

// --------- 4. 加载 & 过滤 & 渲染列表 ---------

async function loadTitlesFromCloud() {
  if (!supabase) {
    console.warn('[TitleApp] supabaseClient 不存在，跳过云端加载');
    return;
  }
  try {
    const { data, error } = await supabase
      .from('titles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    state.titles = data || [];
    console.log('[TitleApp] 从云端加载标题条数：', state.titles.length);
    renderTitles();
  } catch (e) {
    console.error('[TitleApp] loadTitlesFromCloud error', e);
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

  tbody.innerHTML = '';
  mobileList.innerHTML = '';

  const list = applyFilters(state.titles);

  list.forEach((item, index) => {
    // ---------- 桌面端行 ----------
    const tr = document.createElement('tr');

    const tdIndex = document.createElement('td');
    tdIndex.textContent = index + 1;
    tr.appendChild(tdIndex);

    const tdText = document.createElement('td');
    tdText.textContent = item.text || '';
    tr.appendChild(tdText);

    const tdCat = document.createElement('td');
    tdCat.textContent = item.main_category || '';
    tr.appendChild(tdCat);

    const tdUsage = document.createElement('td');
    tdUsage.className = 'text-center';
    tdUsage.textContent = item.usage_count || 0;
    tr.appendChild(tdUsage);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions-cell';

    const group = document.createElement('div');
    group.className = 'action-group';

    const btnCopy = document.createElement('button');
    btnCopy.className = 'function-btn ghost text-xs btn-inline';
    btnCopy.textContent = '复制';
    btnCopy.addEventListener('click', () => copyTitle(item));

    const btnEdit = document.createElement('button');
    btnEdit.className = 'function-btn ghost text-xs btn-inline';
    btnEdit.textContent = '修改';
    btnEdit.addEventListener('click', () => openTitleModal(item));

    const btnDel = document.createElement('button');
    btnDel.className = 'function-btn ghost text-xs btn-inline';
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
    const catText = item.main_category ? item.main_category : '未分类';
    const usageText = item.usage_count || 0;
    cMeta.textContent = `分类：${catText} ｜ 使用：${usageText}`;

    const actions = document.createElement('div');
    actions.className = 'flex gap-2';

    const mCopy = document.createElement('button');
    mCopy.className = 'function-btn ghost text-xs btn-inline';
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
    console.error('[TitleApp] 复制失败', e);
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
    console.error('[TitleApp] 更新 usage_count 失败', e);
  }
}

async function deleteTitle(item) {
  if (!confirm('确定删除该标题？')) return;

  state.titles = state.titles.filter((t) => t.id !== item.id);
  renderTitles();

  if (!supabase || !item.id) return;

  try {
    await supabase.from('titles').delete().eq('id', item.id);
    showToast('已删除');
  } catch (e) {
    console.error('[TitleApp] 删除失败', e);
    showToast('删除失败（云端）', 'error');
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
  console.log('[TitleApp] openTitleModal', item);
  const modal = document.getElementById('titleModal');
  const titleEl = document.getElementById('titleModalTitle');
  const fieldText = document.getElementById('fieldText');
  const fieldCat = document.getElementById('fieldMainCategory');
  const fieldType = document.getElementById('fieldContentType');
  const fieldScene = document.getElementById('fieldSceneTags');

  if (!modal || !titleEl || !fieldText || !fieldCat || !fieldType || !fieldScene) {
    console.error('[TitleApp] 标题弹窗元素缺失');
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
    ? sceneRaw
        .split(/[，,、]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const payload = {
    text,
    main_category: cat,
    content_type: type,
    scene_tags: sceneTags
  };

  console.log(
    '[TitleApp] 保存标题 payload =',
    payload,
    'editingId =',
    state.editingId
  );

  // 本地先更新
  if (state.editingId) {
    state.titles = state.titles.map((t) =>
      t.id === state.editingId ? { ...t, ...payload } : t
    );
  } else {
    const fakeId = 'local_' + Date.now();
    state.titles.unshift({
      id: fakeId,
      usage_count: 0,
      ...payload
    });
  }
  renderTitles();
  closeTitleModal();
  showToast('已保存（本地）');

  if (!supabase) {
    console.warn('[TitleApp] supabase 不存在，只保存本地状态');
    return;
  }

  try {
    if (state.editingId && !String(state.editingId).startsWith('local_')) {
      await supabase.from('titles').update(payload).eq('id', state.editingId);
    } else {
      const { data, error } = await supabase
        .from('titles')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      // 用云端返回的真实 id 替换本地 fake
      state.titles = state.titles.map((t) =>
        t.id && String(t.id).startsWith('local_') && t.text === payload.text
          ? data
          : t
      );
      renderTitles();
    }
    showToast('已同步到云端');
  } catch (e) {
    console.error('[TitleApp] 保存到云端失败', e);
    showToast('云端保存失败（本地已保存）', 'error');
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
  console.log('[TitleApp] openImportModal');
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

  console.log('[TitleApp] 批量导入 payloads =', payloads.length);

  // 保持正序：push 到列表尾部
  const now = Date.now();
  payloads.forEach((p, idx) => {
    state.titles.push({
      id: 'local_' + (now + idx),
      usage_count: 0,
      ...p
    });
  });
  renderTitles();
  closeImportModal();
  showToast('已导入（本地）');

  // 云端写入
  if (!supabase) {
    console.warn('[TitleApp] supabase 不存在，只保存本地状态（批量导入）');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('titles')
      .insert(payloads)
      .select();

    if (error) throw error;

    if (Array.isArray(data) && data.length > 0) {
      await loadTitlesFromCloud();
    }

    showToast('批量导入已同步云端');
  } catch (e) {
    console.error('[TitleApp] 批量导入云端失败', e);
    showToast('云端导入失败（本地已导入）', 'error');
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

// 把快照中的 titles 写回 Supabase.titles，保证刷新后仍然是这批数据
async function overwriteTitlesFromSnapshot(titles) {
  if (!supabase) return;
  try {
    const { error: delError } = await supabase
      .from('titles')
      .delete()
      .not('id', 'is', null);
    if (delError) throw delError;

    if (!Array.isArray(titles) || titles.length === 0) return;

    const cleaned = titles.map((t) => ({
      text: t.text || '',
      main_category: t.main_category || null,
      content_type: t.content_type || null,
      scene_tags: Array.isArray(t.scene_tags) ? t.scene_tags : [],
      usage_count: t.usage_count || 0
    }));

    const { error: insError } = await supabase.from('titles').insert(cleaned);
    if (insError) throw insError;
  } catch (e) {
    console.error('[TitleApp] overwriteTitlesFromSnapshot error', e);
    showToast('写回云端失败（本地已加载快照）', 'error');
  }
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
    // 更新 default 占位
    await supabase.from(SNAPSHOT_TABLE).upsert({
      key: SNAPSHOT_DEFAULT_KEY,
      payload,
      updated_at: nowIso
    });

    // 新增历史快照
    const histKey = 'snap_' + payload.updated_at;
    await supabase.from(SNAPSHOT_TABLE).insert({
      key: histKey,
      payload,
      updated_at: nowIso
    });

    showToast('已保存到云端');
    await renderCloudHistoryList();
  } catch (e) {
    console.error('[TitleApp] saveCloudSnapshot error', e);
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
      // 把用于占位的 default 快照排除掉，列表里只显示历史快照
      .neq('key', SNAPSHOT_DEFAULT_KEY)
      .order('updated_at', { ascending: false })
      .limit(5);

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
    console.error('[TitleApp] renderCloudHistoryList error', e);
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

    const payload = data.payload;

    applySnapshotPayload(payload);

    // 把快照 titles 覆盖写回 titles 表，保证刷新后不丢
    await overwriteTitlesFromSnapshot(payload.titles || []);

    // 再拉一遍云端，保证 state.titles 是最新结构
    await loadTitlesFromCloud();

    showToast('云端数据已加载');
    const panel = document.getElementById('cloudHistoryPanel');
    if (panel) {
      panel.classList.add('hidden');
      panel.style.display = 'none';
    }
  } catch (e) {
    console.error('[TitleApp] loadCloudSnapshot error', e);
    alert('加载云端失败：' + (e.message || String(e)));
  }
}

async function toggleCloudHistoryPanel() {
  const panel = document.getElementById('cloudHistoryPanel');
  const btnLoad = document.getElementById('btnLoadCloud');
  if (!panel || !btnLoad) return;

  const isHidden =
    panel.classList.contains('hidden') || panel.style.display === 'none';

  if (isHidden) {
    const rect = btnLoad.getBoundingClientRect();
    const scrollTop =
      window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft =
      window.pageXOffset || document.documentElement.scrollLeft;

    panel.style.left = rect.left + scrollLeft + 'px';
    panel.style.top = rect.bottom + scrollTop + 8 + 'px';

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
      alert('设置页面（占位），后续可跳转到 settings.html');
    });
  }

  if (btnManage) {
    btnManage.addEventListener('click', () => {
      alert('管理页面（占位），后续可跳转到 admin.html');
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

// --------- 11. 暴露给 HTML 的全局函数 ---------

window.openTitleModal = openTitleModal;
window.openImportModal = openImportModal;
