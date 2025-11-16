// assets/app-title.js
// 标题管理主逻辑（桌面表格 + 手机卡片 + 云端快照）

console.log('[TitleApp] app-title.js loaded');

// =============== 0. 全局常量 & 状态 ===============

const supabase = window.supabaseClient || null;

const PAGE_MODE = window.location.pathname.includes('content')
  ? 'content'
  : 'title';
const ITEM_LABEL = PAGE_MODE === 'content' ? '文案' : '标题';
const ITEM_TABLE = PAGE_MODE === 'content' ? 'contents' : 'titles';
const COUNTER_TABLE = PAGE_MODE === 'content' ? 'titles' : 'contents';

const DEFAULT_CATEGORIES = ['全部', '亲子', '情侣', '闺蜜', '单人', '烟花', '夜景'];
const CATEGORY_LS_KEY = `${PAGE_MODE}_categories_v1`;
const DISPLAY_SETTINGS_KEY = 'display_settings_v1';
const CLOUD_VERSION_KEY = 'cloud_snapshot_version';
const DEFAULT_DISPLAY_SETTINGS = {
  brandColor: '#1990ff',
  brandHover: '#1477dd',
  ghostColor: '#eef2ff',
  ghostHover: '#e2e8ff',
  stripeColor: '#f9fafb',
  hoverColor: '#eef2ff',
  scenes: ['港迪城堡', '烟花', '夜景', '香港街拍'],
  titleText: '标题与文案管理系统',
  titleColor: '#1990ff'
};

const SNAPSHOT_TABLE = 'title_snapshots';
const SNAPSHOT_DEFAULT_KEY = 'default'; // 占位快照 key（不在列表里显示）

const state = {
  titles: [], // 当前所有标题记录（来自 Supabase.titles）
  categories: [...DEFAULT_CATEGORIES],
  currentCategory: '全部',
  filters: {
    search: '',
    scene: ''
  },
  editingId: null, // 当前弹窗编辑的 id（null = 新增）
  viewSettings: {}, // 预留
  isSortingCategories: false, // 分类是否处在“排序模式”
  cloudVersion: Number(localStorage.getItem(CLOUD_VERSION_KEY) || 0)
};

let toastTimer = null;

function getDisplaySettings() {
  const raw = localStorage.getItem(DISPLAY_SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_DISPLAY_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    return {
      ...DEFAULT_DISPLAY_SETTINGS,
      ...parsed,
      scenes: scenes.length ? scenes : [...DEFAULT_DISPLAY_SETTINGS.scenes]
    };
  } catch (e) {
    console.error('[TitleApp] 解析显示设置失败', e);
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

function applyDisplaySettings() {
  const settings = getDisplaySettings();
  const root = document.documentElement;
  root.style.setProperty('--brand-blue', settings.brandColor);
  root.style.setProperty('--brand-blue-hover', settings.brandHover);
  root.style.setProperty('--ghost-bg', settings.ghostColor);
  root.style.setProperty('--ghost-hover', settings.ghostHover);
  root.style.setProperty('--table-stripe', settings.stripeColor);
  root.style.setProperty('--list-hover', settings.hoverColor);
  root.style.setProperty('--topbar-title-color', settings.titleColor);

  const topbarTitle = document.querySelector('.topbar-title');
  if (topbarTitle) {
    topbarTitle.textContent = settings.titleText ||
      DEFAULT_DISPLAY_SETTINGS.titleText;
    topbarTitle.style.color = settings.titleColor;
  }

  renderSceneFilterOptions(settings);
}

function persistDisplaySettings(settings) {
  if (!settings) return;
  const merged = { ...DEFAULT_DISPLAY_SETTINGS, ...settings };
  localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(merged));
}

function renderSceneFilterOptions(settings) {
  const filterScene = document.getElementById('filterScene');
  if (!filterScene) return;
  const prevValue = filterScene.value;
  filterScene.innerHTML = '<option value="">场景（全部）</option>';
  (settings.scenes || []).forEach((scene) => {
    const opt = document.createElement('option');
    opt.value = scene;
    opt.textContent = scene;
    filterScene.appendChild(opt);
  });

  if (settings.scenes.includes(prevValue)) {
    filterScene.value = prevValue;
  } else {
    filterScene.value = '';
    state.filters.scene = '';
  }
}

function persistSnapshotCategories(payload) {
  if (!payload) return;
  if (Array.isArray(payload.titleCategories)) {
    localStorage.setItem('title_categories_v1', JSON.stringify(payload.titleCategories));
  }
  if (Array.isArray(payload.contentCategories)) {
    localStorage.setItem(
      'content_categories_v1',
      JSON.stringify(payload.contentCategories)
    );
  }
}

async function bootstrapCloudState() {
  if (!supabase) {
    console.warn('[TitleApp] supabaseClient 不存在，跳过快照加载');
    await loadTitlesFromCloud();
    return;
  }

  try {
    const defaultSnapshot = await fetchSnapshotByKey(SNAPSHOT_DEFAULT_KEY);

    if (defaultSnapshot?.payload) {
      state.cloudVersion = defaultSnapshot.payload.version || 0;
      localStorage.setItem(CLOUD_VERSION_KEY, String(state.cloudVersion));

      if (defaultSnapshot.payload.displaySettings) {
        persistDisplaySettings(defaultSnapshot.payload.displaySettings);
        applyDisplaySettings();
      }

      persistSnapshotCategories(defaultSnapshot.payload);
      applySnapshotPayload(defaultSnapshot.payload);
      await syncSnapshotTables(defaultSnapshot.payload);
      showToast('已加载云端快照');
      return;
    }

    await loadTitlesFromCloud();
  } catch (e) {
    console.error('[TitleApp] bootstrapCloudState error', e);
    showToast('加载云端失败，已切换本地列表', 'error');
    await loadTitlesFromCloud();
  }
}

// =============== 1. 初始化入口 ===============

document.addEventListener('DOMContentLoaded', () => {
  console.log('[TitleApp] DOMContentLoaded: init');

  applyDisplaySettings();

  // 分类
  loadCategoriesFromLocal();
  renderCategoryList();
  bindCategoryButtons();
  setupMobileCategoryDropdown();

  // 工具栏 / 弹窗 / 云端 / 全局按钮
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

  // 初始从云端加载一遍：优先快照（同时保证标题与文案同步），失败则回退表数据
  bootstrapCloudState();
});

// =============== 2. 分类逻辑 ===============

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

    // 左侧：分类名
    const nameSpan = document.createElement('span');
    nameSpan.className = 'category-name';
    nameSpan.textContent = cat;

    // 右侧：数量 + （可选的排序按钮）
    const rightSpan = document.createElement('span');
    rightSpan.className = 'category-right';

    let count = 0;
    if (cat === '全部') {
      count = state.titles.length;
    } else {
      count = state.titles.filter((t) => t.main_category === cat).length;
    }
    const countSpan = document.createElement('span');
    countSpan.className = 'category-count';
    countSpan.textContent = `${count}条`;
    rightSpan.appendChild(countSpan);

    // 排序模式：给非“全部”增加 ↑↓ 按钮
    if (state.isSortingCategories && cat !== '全部') {
      const controls = document.createElement('span');
      controls.className = 'category-sort-controls';

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.textContent = '↑';
      btnUp.className = 'function-btn ghost text-xs btn-inline';
      btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderCategory(index, -1);
      });

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.textContent = '↓';
      btnDown.className = 'function-btn ghost text-xs btn-inline';
      btnDown.style.marginLeft = '4px';
      btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderCategory(index, 1);
      });

      controls.appendChild(btnUp);
      controls.appendChild(btnDown);
      rightSpan.appendChild(controls);
    }

    // 普通点击：切换当前分类
    li.addEventListener('click', () => {
      state.currentCategory = cat;
      renderCategoryList();
      renderTitles();
    });

    li.appendChild(nameSpan);
    li.appendChild(rightSpan);
    list.appendChild(li);
  });

  updateMobileCategoryLabel();
}

// index 当前下标，delta = -1 上移 / +1 下移
function reorderCategory(index, delta) {
  const newIndex = index + delta;

  // 0 是“全部”，不能动；其它从 1 开始
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

// =============== 2.5 手机端分类下拉 ===============

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

// =============== 3. 工具栏：搜索 / 场景筛选 / 按钮 ===============

function bindToolbar() {
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const filterScene = document.getElementById('filterScene');

  const btnNewTitle = document.getElementById('btnNewTitle');
  const btnBatchImport = document.getElementById('btnBatchImport');
  const btnClearAll = document.getElementById('btnClearAll');

  // 🔍 搜索 + 「清除」按钮
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
      console.log(`[TitleApp] 点击 新增${ITEM_LABEL}`);
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
      if (!confirm(`确定清空全部${ITEM_LABEL}？此操作不可恢复`)) return;
      if (!supabase) {
        showToast('Supabase 未配置，无法清空云端', 'error');
        return;
      }
      try {
        // 用 not('id','is',null) 避免 uuid 比较 "null" 报错
        const { error } = await supabase
          .from(ITEM_TABLE)
          .delete()
          .not('id', 'is', null);

        if (error) throw error;

        state.titles = [];
        renderTitles();
        showToast(`已清空全部${ITEM_LABEL}`);
      } catch (e) {
        console.error('[TitleApp] 清空全部失败', e);
        showToast('清空失败： ' + (e.message || ''), 'error');
      }
    });
  }
}

// =============== 4. 加载 & 过滤 & 渲染列表 ===============

async function loadTitlesFromCloud() {
  if (!supabase) {
    console.warn('[TitleApp] supabaseClient 不存在，跳过云端加载');
    return;
  }
  try {
    const { data, error } = await supabase
      .from(ITEM_TABLE)
      .select('*')
      // 按 created_at 正序：旧的在上，新插入在后面，保持“1、2、3…”顺序不变
      .order('created_at', { ascending: true });

    if (error) throw error;
    state.titles = data || [];
    console.log(`[TitleApp] 从云端加载${ITEM_LABEL}条数：`, state.titles.length);
    // 云端数据变化后，需要同步刷新分类数量
    renderCategoryList();
    renderTitles();
  } catch (e) {
    console.error('[TitleApp] loadTitlesFromCloud error', e);
    showToast(`加载${ITEM_LABEL}失败`, 'error');
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

    // ⚠️ 不再显示 usage_count 列
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

    const headerRow = document.createElement('div');
    headerRow.className = 'flex items-start justify-between gap-2';

    const cTitle = document.createElement('div');
    cTitle.className = 'text-sm font-medium flex-1 min-w-0';
    cTitle.textContent = item.text || '';

    const actions = document.createElement('div');
    actions.className = 'flex gap-2 flex-shrink-0';

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
    headerRow.append(cTitle, actions);

    card.append(headerRow);
    mobileList.appendChild(card);
  });

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-xs text-gray-500 py-2';
    empty.textContent = `暂无${ITEM_LABEL}，请先新增。`;
    mobileList.appendChild(empty);
  }
}

// =============== 5. 标题操作：复制 / 删除 ===============

async function copyTitle(item) {
  // 1. 先复制到剪贴板
  try {
    await navigator.clipboard.writeText(item.text || '');
    showToast('已复制');
  } catch (e) {
    console.error('[TitleApp] 复制失败', e);
    showToast('复制失败', 'error');
  }

  // 2. 没有云端或没有 id，就不记 usage_count 了
  if (!supabase || !item.id) return;

  // 3. 只更新这一条记录的 usage_count，本地顺序不动
  try {
    const newCount = (item.usage_count || 0) + 1;

    await supabase
      .from(ITEM_TABLE)
      .update({ usage_count: newCount })
      .eq('id', item.id);

    // 本地 state.titles 也同步一下 usage_count，但不重新排序
    const idx = state.titles.findIndex((t) => t.id === item.id);
    if (idx !== -1) {
      state.titles[idx] = {
        ...state.titles[idx],
        usage_count: newCount
      };
    }
  } catch (e) {
    console.error('[TitleApp] 更新 usage_count 失败', e);
  }
}

async function deleteTitle(item) {
  if (!confirm(`确定删除该${ITEM_LABEL}？`)) return;

  state.titles = state.titles.filter((t) => t.id !== item.id);
  renderTitles();

  if (!supabase || !item.id) return;

  try {
    await supabase.from(ITEM_TABLE).delete().eq('id', item.id);
    showToast('已删除');
  } catch (e) {
    console.error('[TitleApp] 删除失败', e);
    showToast('删除失败（云端）', 'error');
  }
}

// =============== 6. 标题弹窗 ===============

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
  if (!modal) return;

  const titleEl = document.getElementById('titleModalTitle');
  const textEl = document.getElementById('fieldText');
  const mainCatEl = document.getElementById('fieldMainCategory');
  const typeEl = document.getElementById('fieldContentType');
  const sceneEl = document.getElementById('fieldSceneTags');

  // 初始化弹窗下拉分类选项
  refreshModalCategoryOptions(mainCatEl);

  if (item && item.id) {
    state.editingId = item.id;
    if (titleEl) titleEl.textContent = `修改${ITEM_LABEL}`;
    if (textEl) textEl.value = item.text || '';
    if (mainCatEl) mainCatEl.value = item.main_category || '';
    if (typeEl) typeEl.value = item.content_type || '';
    if (sceneEl)
      sceneEl.value = Array.isArray(item.scene_tags)
        ? item.scene_tags.join(', ')
        : '';
  } else {
    state.editingId = null;
    if (titleEl) titleEl.textContent = `新增${ITEM_LABEL}`;
    if (textEl) textEl.value = '';
    if (mainCatEl)
      mainCatEl.value = state.currentCategory === '全部' ? '' : state.currentCategory;
    if (typeEl) typeEl.value = '';
    if (sceneEl) sceneEl.value = '';
  }

  modal.classList.remove('hidden');
}

function closeTitleModal() {
  const modal = document.getElementById('titleModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function refreshModalCategoryOptions(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = '';

  const cats = state.categories.filter((c) => c !== '全部');
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '未选择';
  selectEl.appendChild(emptyOpt);

  cats.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    selectEl.appendChild(opt);
  });
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
    showToast(`${ITEM_LABEL}不能为空`, 'error');
    return;
  }

  // 场景标签拆分
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
    `[TitleApp] 保存${ITEM_LABEL} payload =`,
    payload,
    'editingId =',
    state.editingId
  );

  if (!supabase) {
    showToast('未配置 Supabase，无法保存到云端', 'error');
    return;
  }

  // 记录当前所在的分类，用来保持筛选不变（包括“全部”）
  const prevCategory = state.currentCategory;

  try {
    if (state.editingId) {
      // ====== 情况一：编辑已有标题 ======

      const { error } = await supabase
        .from(ITEM_TABLE)
        .update(payload)
        .eq('id', state.editingId);

      if (error) throw error;

      // 本地 state.titles 里就地更新，不改变原来的 index 顺序
      const idx = state.titles.findIndex((t) => t.id === state.editingId);
      if (idx !== -1) {
        state.titles[idx] = {
          ...state.titles[idx],
          ...payload
        };
      }

      showToast(`${ITEM_LABEL}已更新`);
    } else {
      // ====== 情况二：新增标题 ======

      const insertPayload = {
        ...payload,
        usage_count: 0
      };

      // 要回写新插入的那条记录，所以加上 .select().single()
      const { data, error } = await supabase
        .from(ITEM_TABLE)
        .insert([insertPayload])
        .select()
        .single();

      if (error) throw error;

      // 新增的直接加到数组末尾，顺序就是“最新一条在最后”
      if (data) {
        state.titles.push(data);
      }

      showToast(`${ITEM_LABEL}已新增`);
    }

    // 保持原来的筛选分类，不自动切到其他分类
    state.currentCategory = prevCategory;

    // 分类数量重新计算
    renderCategoryList();
    renderTitles();
    closeTitleModal();
  } catch (e) {
    console.error('[TitleApp] 保存标题失败', e);
    showToast('保存失败：' + (e.message || ''), 'error');
  }
}

// =============== 7. 批量导入弹窗 ===============

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
  if (!modal) return;

  const rawInput = document.getElementById('importRawInput');
  if (rawInput) rawInput.value = '';

  modal.classList.remove('hidden');
}

function closeImportModal() {
  const modal = document.getElementById('importModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

async function runImport() {
  const rawInput = document.getElementById('importRawInput');
  if (!rawInput) return;

  const raw = rawInput.value || '';
  const lines = raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!lines.length) {
    showToast('没有可导入的内容', 'error');
    return;
  }

  if (!supabase) {
    showToast('未配置 Supabase，无法导入云端', 'error');
    return;
  }

  const rows = lines.map((text) => ({
    text,
    main_category: state.currentCategory === '全部' ? null : state.currentCategory,
    content_type: null,
    scene_tags: [],
    usage_count: 0
  }));

  try {
    const { error } = await supabase.from(ITEM_TABLE).insert(rows);
    if (error) throw error;
    showToast(`批量导入成功，共 ${rows.length} 条`);
    closeImportModal();
    await loadTitlesFromCloud();
  } catch (e) {
    console.error('[TitleApp] 批量导入云端失败', e);
    showToast('云端导入失败', 'error');
  }
}

// =============== 8. 云端快照：保存 / 加载 / 列表 ===============

function getCounterCategories() {
  const key = PAGE_MODE === 'title' ? 'content_categories_v1' : 'title_categories_v1';
  const raw = localStorage.getItem(key);
  if (!raw) return [...DEFAULT_CATEGORIES];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return [...DEFAULT_CATEGORIES];
    const set = new Set(arr);
    set.delete('全部');
    return ['全部', ...set];
  } catch (e) {
    console.error('[TitleApp] getCounterCategories error', e);
    return [...DEFAULT_CATEGORIES];
  }
}

async function fetchSnapshotByKey(key) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(SNAPSHOT_TABLE)
      .select('key, payload, updated_at')
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (e) {
    console.error('[TitleApp] fetchSnapshotByKey error', e);
    return null;
  }
}

function collectSnapshotPayload(otherItems = [], otherCategories = []) {
  const payload = {
    ver: 1,
    version: state.cloudVersion + 1,
    snapshot_label: '',
    updated_at: Date.now(),
    titles: [],
    contents: [],
    titleCategories: [],
    contentCategories: [],
    viewSettings: state.viewSettings,
    displaySettings: getDisplaySettings(),
    origin: PAGE_MODE
  };

  if (PAGE_MODE === 'title') {
    payload.titles = state.titles;
    payload.contents = otherItems;
    payload.titleCategories = state.categories;
    payload.contentCategories = otherCategories;
  } else {
    payload.contents = state.titles;
    payload.titles = otherItems;
    payload.contentCategories = state.categories;
    payload.titleCategories = otherCategories;
  }

  return payload;
}

function applySnapshotPayload(payload) {
  if (!payload) return;
  const currentItems = PAGE_MODE === 'title' ? payload.titles : payload.contents;
  const currentCategories =
    PAGE_MODE === 'title' ? payload.titleCategories : payload.contentCategories;

  state.titles = Array.isArray(currentItems) ? currentItems : [];
  state.categories = Array.isArray(currentCategories)
    ? currentCategories
    : [...DEFAULT_CATEGORIES];
  state.viewSettings = payload.viewSettings || {};

  // 覆盖显示设置，保持两页一致
  if (payload.displaySettings) {
    persistDisplaySettings(payload.displaySettings);
    applyDisplaySettings();
  }

  // 将双端分类写回本地，确保跨页面同步
  persistSnapshotCategories(payload);

  // 记录云端版本，避免并发冲突
  if (typeof payload.version === 'number') {
    state.cloudVersion = payload.version;
    localStorage.setItem(CLOUD_VERSION_KEY, String(payload.version));
  }

  saveCategoriesToLocal();
  renderCategoryList();
  renderTitles();
}

async function syncSnapshotTableToCloud(table, items) {
  if (!supabase) {
    alert('未配置 Supabase');
    return;
  }
  if (!Array.isArray(items)) return;

  try {
    // 方案：先删除表中所有数据，再批量插入快照里的 titles
    const { error: delError } = await supabase
      .from(table)
      .delete()
      .not('id', 'is', null);
    if (delError) throw delError;

    if (items.length > 0) {
      const { error: insertError } = await supabase.from(table).insert(
        items.map((t) => ({
          text: t.text,
          main_category: t.main_category || null,
          content_type: t.content_type || null,
          scene_tags: Array.isArray(t.scene_tags) ? t.scene_tags : [],
          usage_count: t.usage_count || 0
        }))
      );
      if (insertError) throw insertError;
    }

    showToast('快照数据已同步到云端');
    await loadTitlesFromCloud();
  } catch (e) {
    console.error('[TitleApp] syncSnapshotTitlesToCloud error', e);
    alert('同步快照到云端失败：' + (e.message || 'Unknown error'));
  }
}

async function saveCloudSnapshot() {
  if (!supabase) {
    alert('未配置 Supabase');
    return;
  }

  const label = prompt('请输入这次快照的备注名称（例如：11月中旬版本）：', '');
  if (label === null) return;

  const [counterItems, defaultSnapshot] = await Promise.all([
    fetchCounterItems(),
    fetchSnapshotByKey(SNAPSHOT_DEFAULT_KEY)
  ]);
  const counterCategories = getCounterCategories();

  const serverVersion = defaultSnapshot?.payload?.version || 0;
  const localVersion = Number(localStorage.getItem(CLOUD_VERSION_KEY) || 0);

  if (serverVersion > localVersion) {
    const ok = confirm(
      '检测到云端存在更新的版本，确认覆盖云端并保存当前两个页面的数据吗？'
    );
    if (!ok) return;
  }

  const payload = collectSnapshotPayload(counterItems, counterCategories);
  payload.snapshot_label = label.trim();
  payload.version = Math.max(serverVersion, localVersion) + 1;

  const key = `manual_${Date.now()}`;

  try {
    const { error } = await supabase.from(SNAPSHOT_TABLE).upsert(
      [
        {
          key,
          payload,
          updated_at: new Date().toISOString()
        },
        {
          key: SNAPSHOT_DEFAULT_KEY,
          payload,
          updated_at: new Date().toISOString()
        }
      ],
      { onConflict: 'key' }
    );

    if (error) throw error;

    persistSnapshotCategories(payload);
    persistDisplaySettings(payload.displaySettings);
    state.cloudVersion = payload.version;
    localStorage.setItem(CLOUD_VERSION_KEY, String(payload.version));

    await syncSnapshotTables(payload);
    showToast('云端快照已保存');
  } catch (e) {
    console.error('[TitleApp] saveCloudSnapshot error', e);
    alert('保存快照失败：' + (e.message || 'Unknown error'));
  }
}

// 内部不再二次弹窗，始终覆盖 Supabase.titles
async function loadCloudSnapshot(key, options = {}) {
  const { skipConfirm = false } = options;

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
      alert('未找到该快照数据');
      return;
    }

    if (!skipConfirm) {
      const ok = confirm('确定使用此快照覆盖当前数据？');
      if (!ok) return;
    }

    const payload = data.payload;

    // 覆盖前端 & 覆盖云端表
    applySnapshotPayload(payload);
    await syncSnapshotTables(payload);
    showToast('已加载快照并覆盖云端');
  } catch (e) {
    console.error('[TitleApp] loadCloudSnapshot error', e);
    alert('加载快照失败：' + (e.message || 'Unknown error'));
  }
}

async function fetchCounterItems() {
  if (!supabase || !COUNTER_TABLE) return [];
  try {
    const { data, error } = await supabase.from(COUNTER_TABLE).select('*');
    if (error) {
      console.warn('[TitleApp] fetchCounterItems error', error.message);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[TitleApp] fetchCounterItems exception', e);
    return [];
  }
}

async function syncSnapshotTables(payload) {
  const titles = Array.isArray(payload.titles) ? payload.titles : [];
  const contents = Array.isArray(payload.contents) ? payload.contents : [];

  await syncSnapshotTableToCloud('titles', titles);
  await syncSnapshotTableToCloud('contents', contents);
  await loadTitlesFromCloud();
}

// 手机端不遮挡 + 只显示最近 5 条快照
async function renderCloudHistoryList(anchorBtn) {
  if (!supabase) {
    alert('未配置 Supabase');
    return;
  }

  const panel = document.getElementById('cloudHistoryPanel');
  if (!panel) return;

  // 先显示出来，避免 offsetWidth=0
  panel.classList.remove('hidden');
  panel.style.display = 'block';
  panel.innerHTML =
    '<div style="padding:8px 10px;font-size:12px;color:#6b7280;">加载中…</div>';

  // —— 1. 跟随按钮定位，同时限制在屏幕左右以内 ——
  const rect = anchorBtn.getBoundingClientRect();
  const scrollTop =
    window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft =
    window.pageXOffset || document.documentElement.scrollLeft;

  let left = rect.left + scrollLeft;
  const top = rect.bottom + scrollTop + 8;

  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const panelWidth = 260; // 对应 CSS width
  const margin = 8;

  const maxLeft = scrollLeft + viewportWidth - panelWidth - margin;
  const minLeft = scrollLeft + margin;

  if (left > maxLeft) left = Math.max(minLeft, maxLeft);
  if (left < minLeft) left = minLeft;

  panel.style.top = top + 'px';
  panel.style.left = left + 'px';

  // —— 2. 拉取最近 5 条快照 ——
  try {
    const { data, error } = await supabase
      .from(SNAPSHOT_TABLE)
      .select('key, payload, updated_at')
      .neq('key', SNAPSHOT_DEFAULT_KEY)
      .order('updated_at', { ascending: false })
      .limit(5); // 只要 5 条

    if (error) throw error;

    if (!data || data.length === 0) {
      panel.innerHTML =
        '<div style="padding:8px 10px;font-size:12px;color:#6b7280;">暂无快照</div>';
      return;
    }

    const rows = data.map((row) => {
      const p = row.payload || {};
      const label = p.snapshot_label || '(未命名)';
      const updated = row.updated_at
        ? new Date(row.updated_at).toLocaleString()
        : '';
      const count = Array.isArray(p.titles) ? p.titles.length : 0;

      return `
        <div class="cloud-item" data-key="${row.key}">
          <div class="cloud-item-main">
            <div class="cloud-item-name">${label}</div>
            <div class="cloud-item-meta">共 ${count} 条 · ${updated}</div>
          </div>
        </div>
      `;
    });

    panel.innerHTML = rows.join('');

    panel.querySelectorAll('.cloud-item').forEach((el) => {
      el.addEventListener('click', async () => {
        const key = el.getAttribute('data-key');
        if (!key) return;
        const ok = confirm('确定使用此快照覆盖当前数据？');
        if (!ok) return;

        // 只在这里弹一次确认，内部不再二次弹窗
        await loadCloudSnapshot(key, { skipConfirm: true });

        // 覆盖完，自动收起弹层
        panel.classList.add('hidden');
        panel.style.display = 'none';
      });
    });
  } catch (e) {
    console.error('[TitleApp] renderCloudHistoryList error', e);
    panel.innerHTML =
      '<div style="padding:8px 10px;color:#f43f5e;">加载云端快照失败</div>';
  }
}

function toggleCloudHistoryPanel() {
  const panel = document.getElementById('cloudHistoryPanel');
  const btn = document.getElementById('btnLoadCloud');
  if (!panel || !btn) return;

  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    panel.style.display = 'none';
    return;
  }

  renderCloudHistoryList(btn);
}

// =============== 9. 分类按钮：新增 / 删除 / 排序 ===============

function bindCategoryButtons() {
  const btnAdd = document.getElementById('btnAddCategory');
  const btnDel = document.getElementById('btnDeleteCategory');
  const btnSort = document.getElementById('btnSortCategory');

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      const name = prompt('请输入新的分类名称：', '');
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      if (state.categories.includes(trimmed)) {
        alert('已存在同名分类');
        return;
      }

      state.categories.push(trimmed);
      saveCategoriesToLocal();
      renderCategoryList();
      showToast('分类已新增');
    });
  }

  if (btnDel) {
    btnDel.addEventListener('click', () => {
      const cat = state.currentCategory;
      if (!cat || cat === '全部') {
        alert('不能删除「全部」分类');
        return;
      }
      const ok = confirm(
        `确定删除分类「${cat}」？（不会删除${ITEM_LABEL}，只是移除分类标签）`
      );
      if (!ok) return;

      state.categories = state.categories.filter((c) => c !== cat);
      state.titles = state.titles.map((t) =>
        t.main_category === cat ? { ...t, main_category: null } : t
      );

      state.currentCategory = '全部';
      saveCategoriesToLocal();
      renderCategoryList();
      renderTitles();
      showToast('分类已删除');
    });
  }

  if (btnSort) {
    btnSort.addEventListener('click', () => {
      state.isSortingCategories = !state.isSortingCategories;
      renderCategoryList();
      showToast(
        state.isSortingCategories
          ? '分类排序模式已开启（点击↑↓调整顺序）'
          : '已退出分类排序模式'
      );
    });
  }
}

function bindCloudButtons() {
  const btnSave = document.getElementById('btnSaveCloud');
  const btnLoad = document.getElementById('btnLoadCloud');

  if (btnSave) btnSave.addEventListener('click', saveCloudSnapshot);
  if (btnLoad) btnLoad.addEventListener('click', toggleCloudHistoryPanel);
}

function bindGlobalNavButtons() {
  const btnSettings = document.getElementById('btnSettings');
  const btnManage = document.getElementById('btnManagePage');

  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      window.location.href = 'settings.html';
    });
  }

  if (btnManage) {
    btnManage.addEventListener('click', () => {
      window.location.href = 'admin-center.html';
    });
  }
}

// =============== 10. Toast ===============

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;

  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.background =
    type === 'error' ? 'rgba(220,38,38,0.92)' : 'rgba(17,24,39,0.92)';

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, 1800);
}

// =============== 11. 暴露给 HTML 的全局函数 ===============

window.openTitleModal = openTitleModal;
window.openImportModal = openImportModal;
