// assets/app-title.js
// 标题管理主逻辑（桌面表格 + 手机卡片）
//
// 逻辑说明：
// 1. 标题数据本地优先，持久化在 localStorage（TITLE_LS_KEY）
// 2. “清除全部”只清本地，不去动云端任何表
// 3. 云端只用 title_snapshots 表做快照（保存 / 加载）
// 4. 快照保存时记录每行顺序 _orderIndex，加载时按该顺序还原
// 5. 批量导入保持正序：按输入顺序 append 到列表尾部
// 6. 手机端有“分类”下拉按钮，左侧分类面板仅在桌面端显示
// 7. 复制 / 修改 / 删除按钮统一加 btn-inline 类，方便 CSS 控制一排显示

console.log('[TitleApp] app-title.js loaded');

// --------- 0. 全局状态 ---------

const supabase = window.supabaseClient || null;

// 分类默认值 + 本地键名
const DEFAULT_CATEGORIES = ['全部', '亲子', '情侣', '闺蜜', '单人', '烟花', '夜景'];
const CATEGORY_LS_KEY = 'title_categories_v1';

// 标题本地存储键名
const TITLE_LS_KEY = 'title_titles_v1';

// 云端快照相关表
const SNAPSHOT_TABLE = 'title_snapshots';
const SNAPSHOT_DEFAULT_KEY = 'default';

const state = {
  titles: [], // [{id,text,main_category,content_type,scene_tags[],usage_count}]
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

// 云端下拉外部点击监听
let cloudOutsideHandlerAttached = false;

// 保存快照名弹窗回调
let snapshotNameConfirm = null;

// --------- 1. 初始化入口 ---------

document.addEventListener('DOMContentLoaded', () => {
  console.log('[TitleApp] DOMContentLoaded: init');

  // 手机端分类下拉 DOM
  setupMobileCategoryDropdown();

  // 把左侧分类面板改成：手机端隐藏，桌面端显示
  const aside = document.querySelector('.layout > aside.panel');
  if (aside) {
    aside.classList.add('hidden', 'md:block');
  }

  // 分类
  loadCategoriesFromLocal();
  renderCategoryList();
  bindCategoryButtons();

  // 工具栏 & 弹窗 & 云端按钮
  bindToolbar();
  bindTitleModal();
  bindImportModal();
  bindCloudButtons();
  bindGlobalNavButtons();

  // 标题：只从本地恢复
  loadTitlesFromLocal();
  renderTitles();

  if (!supabase) {
    console.warn('[TitleApp] supabaseClient 不存在，云端快照不可用');
  } else {
    console.log('[TitleApp] supabaseClient 已就绪（仅用于 title_snapshots 快照）');
  }
});

// ================================
// 2. 分类逻辑（本地 + 手机端下拉）
// ================================

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
  try {
    localStorage.setItem(CATEGORY_LS_KEY, JSON.stringify(state.categories));
  } catch (e) {
    console.error('[TitleApp] saveCategoriesToLocal error', e);
  }
}

// 统一渲染桌面端 + 手机端分类列表
function renderCategoryList() {
  const desktopList = document.getElementById('categoryList');
  const mobileList = document.getElementById('mobileCategoryList');

  const buildList = (ul) => {
    if (!ul) return;
    ul.innerHTML = '';
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
        // 选中后自动收起手机端下拉
        const dropdown = document.getElementById('mobileCategoryDropdown');
        if (dropdown) {
          dropdown.classList.add('hidden');
        }
      });
      ul.appendChild(li);
    });
  };

  buildList(desktopList);
  buildList(mobileList);

  updateMobileCategoryLabel();
}

// 手机端分类按钮 & 下拉 DOM 搭建
function setupMobileCategoryDropdown() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  if (document.getElementById('mobileCategoryWrapper')) return; // 已创建

  const wrapper = document.createElement('div');
  wrapper.id = 'mobileCategoryWrapper';
  wrapper.className = 'md:hidden mb-3';

  const trigger = document.createElement('button');
  trigger.id = 'mobileCategoryTrigger';
  trigger.className = 'function-btn w-full flex items-center justify-between';
  trigger.innerHTML =
    '<span class="text-sm">分类</span><span id="mobileCategoryLabel" class="text-sm font-medium"></span>';

  const dropdown = document.createElement('div');
  dropdown.id = 'mobileCategoryDropdown';
  dropdown.className = 'mobile-category-dropdown hidden mt-2 panel';

  const ul = document.createElement('ul');
  ul.id = 'mobileCategoryList';
  ul.className = 'category-list';
  dropdown.appendChild(ul);

  wrapper.appendChild(trigger);
  wrapper.appendChild(dropdown);

  // 插在整个 layout 的最前面（手机端显示在分类列表上面）
  layout.insertBefore(wrapper, layout.firstChild);

  trigger.addEventListener('click', () => {
    dropdown.classList.toggle('hidden');
  });
}

// 更新手机端按钮上的“当前分类”文字
function updateMobileCategoryLabel() {
  const labelEl = document.getElementById('mobileCategoryLabel');
  if (labelEl) {
    labelEl.textContent = state.currentCategory;
  }
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
    btnDelete.addEventListener('click', () => {
      const cat = state.currentCategory;
      if (cat === '全部') {
        showToast('不能删除“全部”分类', 'error');
        return;
      }
      if (!state.categories.includes(cat)) {
        showToast('当前分类不存在', 'error');
        return;
      }

      if (!confirm(`确定删除分类「${cat}」？仅影响本地数据`)) return;

      state.categories = state.categories.filter((c) => c !== cat);
      saveCategoriesToLocal();
      state.currentCategory = '全部';
      renderCategoryList();
      showToast('分类已删除（本地）');
    });
  }
}

// ================================
// 3. 标题本地持久化
// ================================

function loadTitlesFromLocal() {
  const raw = localStorage.getItem(TITLE_LS_KEY);
  if (!raw) return;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      state.titles = arr;
      console.log('[TitleApp] 从 localStorage 加载标题条数：', state.titles.length);
    }
  } catch (e) {
    console.error('[TitleApp] loadTitlesFromLocal error', e);
  }
}

function saveTitlesToLocal() {
  try {
    localStorage.setItem(TITLE_LS_KEY, JSON.stringify(state.titles));
  } catch (e) {
    console.error('[TitleApp] saveTitlesToLocal error', e);
  }
}

// ================================
// 4. 工具栏：搜索 / 场景筛选 / 按钮
// ================================

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
    btnNewTitle.addEventListener('click', () => {
      openTitleModal();
    });
  }

  if (btnBatchImport) {
    btnBatchImport.addEventListener('click', () => {
      openImportModal();
    });
  }

  // 清除全部：只清本地，不动云端
  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
      if (!confirm('确定清空当前所有标题？仅清除本地数据，不影响云端快照。')) return;
      state.titles = [];
      saveTitlesToLocal();
      renderTitles();
      showToast('本地标题已清空');
    });
  }
}

// ================================
// 5. 加载 & 过滤 & 渲染列表（完全本地）
// ================================

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

    // 操作按钮（复制 / 修改 / 删除）
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
    mEdit.className = 'function-btn ghost text-xs btn-inline';
    mEdit.textContent = '修改';
    mEdit.addEventListener('click', () => openTitleModal(item));

    const mDel = document.createElement('button');
    mDel.className = 'function-btn ghost text-xs btn-inline';
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

// ================================
// 6. 标题操作：复制 / 删除（本地）
// ================================

async function copyTitle(item) {
  try {
    await navigator.clipboard.writeText(item.text || '');
    showToast('已复制');
  } catch (e) {
    console.error('[TitleApp] 复制失败', e);
    showToast('复制失败', 'error');
  }

  // 本地增加使用次数
  state.titles = state.titles.map((t) =>
    t.id === item.id ? { ...t, usage_count: (t.usage_count || 0) + 1 } : t
  );
  saveTitlesToLocal();
  renderTitles();
}

function deleteTitle(item) {
  if (!confirm('确定删除该标题？')) return;

  state.titles = state.titles.filter((t) => t.id !== item.id);
  saveTitlesToLocal();
  renderTitles();
  showToast('已删除');
}

// ================================
// 7. 标题弹窗：打开 / 保存 / 关闭
// ================================

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
      state.currentCategory !== '全部' && state.currentCategory !== '未分类'
        ? state.currentCategory
        : '';
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

function genId() {
  return (
    't_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

function saveTitleFromModal() {
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

  if (state.editingId) {
    state.titles = state.titles.map((t) =>
      t.id === state.editingId ? { ...t, ...payload } : t
    );
  } else {
    // 新增标题：追加到列表末尾，保持 1、2、3… 正序
    state.titles.push({
      id: genId(),
      usage_count: 0,
      ...payload
    });
  }

  saveTitlesToLocal();
  renderTitles();
  closeTitleModal();
  showToast('已保存');
}

// ================================
// 8. 批量导入弹窗（本地）
// ================================

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

  // 识别预览功能取消：直接隐藏右侧那一列
  if (preview) {
    const wrapper = preview.parentElement; // 包着 label+preview 的 div
    if (wrapper) {
      wrapper.style.display = 'none';
    }
    preview.innerHTML = '';
  }

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closeImportModal() {
  const modal = document.getElementById('importModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

// 批量导入：保持正序（按文本从上到下 append 到列表末尾）
function runImport() {
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

  lines.forEach((text) => {
    state.titles.push({
      id: genId(),
      text,
      main_category: currentCat,
      content_type: null,
      scene_tags: [],
      usage_count: 0
    });
  });

  saveTitlesToLocal();
  renderTitles();
  closeImportModal();
  showToast(`已导入 ${lines.length} 条标题`);
}

// ================================
// 9. 云端快照：保存 / 加载 / 列表（title_snapshots）
// ================================

// 保存时记录当前顺序 _orderIndex
function collectSnapshotPayload() {
  const titlesWithOrder = state.titles.map((t, idx) => ({
    ...t,
    _orderIndex: idx
  }));

  return {
    ver: 2,
    snapshot_label: '',
    updated_at: Date.now(),
    titles: titlesWithOrder,
    categories: state.categories,
    viewSettings: state.viewSettings
  };
}

function applySnapshotPayload(payload) {
  if (!payload) return;

  let titles = Array.isArray(payload.titles) ? payload.titles.slice() : [];

  titles.sort((a, b) => {
    const ai =
      typeof a._orderIndex === 'number'
        ? a._orderIndex
        : 0;
    const bi =
      typeof b._orderIndex === 'number'
        ? b._orderIndex
        : 0;
    return ai - bi;
  });

  titles = titles.map((t) => {
    const { _orderIndex, ...rest } = t;
    return rest;
  });

  state.titles = titles;
  state.categories = Array.isArray(payload.categories)
    ? payload.categories
    : [...DEFAULT_CATEGORIES];
  state.viewSettings = payload.viewSettings || {};

  saveCategoriesToLocal();
  saveTitlesToLocal();
  renderCategoryList();
  renderTitles();
}

// 自定义快照名称弹窗（居中）
function openSnapshotNameModal(onConfirm) {
  snapshotNameConfirm = onConfirm;

  let backdrop = document.getElementById('snapshotNameModal');
  let input, btnOk, btnCancel;

  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'snapshotNameModal';
    backdrop.className = 'modal-backdrop hidden';

    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">保存云端快照</div>
        <button class="icon-btn" id="snapshotCloseBtn" aria-label="关闭">×</button>
      </div>
      <div class="modal-body space-y-3">
        <div>
          <label class="field-label">快照名称</label>
          <input id="snapshotNameInput" type="text" class="field-input" placeholder="例如：1115" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="function-btn ghost" id="snapshotCancelBtn">取消</button>
        <button class="function-btn" id="snapshotOkBtn">保存</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    input = modal.querySelector('#snapshotNameInput');
    btnOk = modal.querySelector('#snapshotOkBtn');
    btnCancel = modal.querySelector('#snapshotCancelBtn');
    const btnClose = modal.querySelector('#snapshotCloseBtn');

    const close = () => {
      backdrop.classList.add('hidden');
      backdrop.style.display = 'none';
    };

    btnCancel.addEventListener('click', () => {
      snapshotNameConfirm = null;
      close();
    });

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        snapshotNameConfirm = null;
        close();
      });
    }

    btnOk.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!name) {
        showToast('请输入快照名称', 'error');
        return;
      }
      const fn = snapshotNameConfirm;
      snapshotNameConfirm = null;
      close();
      if (typeof fn === 'function') {
        await fn(name);
      }
    });

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnOk.click();
      }
    });
  } else {
    const modal = backdrop.querySelector('.modal');
    input = modal.querySelector('#snapshotNameInput');
  }

  // 重置输入 & 显示
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 0);
  }
  backdrop.classList.remove('hidden');
  backdrop.style.display = 'flex';
}

async function saveCloudSnapshot() {
  if (!supabase) {
    alert('未配置 Supabase，无法保存云端快照');
    return;
  }

  openSnapshotNameModal(async (name) => {
    let payload = collectSnapshotPayload();
    payload.snapshot_label = name.trim() || '快照';
    payload.updated_at = Date.now();
    const nowIso = new Date(payload.updated_at).toISOString();

    try {
      await supabase.from(SNAPSHOT_TABLE).upsert({
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

      showToast('已保存云端快照');
      await renderCloudHistoryList();
    } catch (e) {
      console.error('[TitleApp] saveCloudSnapshot error', e);
      alert('保存云端失败：' + (e.message || String(e)));
    }
  });
}

async function renderCloudHistoryList() {
  const panel = document.getElementById('cloudHistoryPanel');
  if (!panel) return;

  if (!supabase) {
    panel.innerHTML =
      '<div style="padding:8px 10px;color:#888;">未配置 Supabase，无法使用云端快照</div>';
    return;
  }

  try {
    const { data, error } = await supabase
      .from(SNAPSHOT_TABLE)
      .select('key,payload,updated_at')
      .order('updated_at', { ascending: false })
      .limit(5); // 只取最近 5 个

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
        const ok = confirm('确定使用此快照覆盖当前本地数据？');
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

    applySnapshotPayload(data.payload);
    showToast('云端快照已加载');
    hideCloudPanel();
  } catch (e) {
    console.error('[TitleApp] loadCloudSnapshot error', e);
    alert('加载云端失败：' + (e.message || String(e)));
  }
}

function hideCloudPanel() {
  const panel = document.getElementById('cloudHistoryPanel');
  if (!panel) return;
  panel.classList.add('hidden');
  panel.style.display = 'none';

  if (cloudOutsideHandlerAttached) {
    document.removeEventListener('click', handleClickOutsideCloud, true);
    cloudOutsideHandlerAttached = false;
  }
}

async function toggleCloudHistoryPanel() {
  const panel = document.getElementById('cloudHistoryPanel');
  if (!panel) return;

  const isHidden =
    panel.classList.contains('hidden') || panel.style.display === 'none';

  if (isHidden) {
    // 打开：作为“加载云端”按钮下面的下拉面板
    panel.classList.remove('hidden');
    panel.style.display = 'block';

    const btnLoad = document.getElementById('btnLoadCloud');
    if (btnLoad) {
      const rect = btnLoad.getBoundingClientRect();
      panel.style.position = 'absolute';
      panel.style.top = `${rect.bottom + window.scrollY + 8}px`;
      // 靠右一点，避免超出屏幕
      const right = Math.max(16, window.innerWidth - rect.right);
      panel.style.right = `${right}px`;
      panel.style.left = 'auto';
      panel.style.zIndex = '50';
    }

    await renderCloudHistoryList();

    if (!cloudOutsideHandlerAttached) {
      document.addEventListener('click', handleClickOutsideCloud, true);
      cloudOutsideHandlerAttached = true;
    }
  } else {
    hideCloudPanel();
  }
}

function handleClickOutsideCloud(e) {
  const panel = document.getElementById('cloudHistoryPanel');
  const btn = document.getElementById('btnLoadCloud');
  if (!panel) return;

  if (panel.contains(e.target) || (btn && btn.contains(e.target))) {
    return;
  }
  hideCloudPanel();
}

function bindCloudButtons() {
  const btnSave = document.getElementById('btnSaveCloud');
  const btnLoad = document.getElementById('btnLoadCloud');

  if (btnSave) btnSave.addEventListener('click', saveCloudSnapshot);
  if (btnLoad) btnLoad.addEventListener('click', toggleCloudHistoryPanel);
}

// ================================
// 10. 管理页面 / 设置页面 占位
// ================================

function bindGlobalNavButtons() {
  const btnSettings = document.getElementById('btnSettings');
  const btnManage = document.getElementById('btnManagePage');

  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      alert('设置页面（占位），后续可跳转 settings.html');
    });
  }

  if (btnManage) {
    btnManage.addEventListener('click', () => {
      alert('管理页面（占位），后续可跳转 admin-center.html');
    });
  }
}

// ================================
// 11. Toast
// ================================

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

// ================================
// 12. 暴露给 HTML 的全局函数（给 onclick 用）
// ================================

window.openTitleModal = openTitleModal;
window.openImportModal = openImportModal;
