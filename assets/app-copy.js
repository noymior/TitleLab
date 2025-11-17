// assets/app-copy.js
// 文案管理主逻辑（桌面表格 + 手机卡片 + 云端快照）

console.log('[CopyApp] app-copy.js loaded');

// =============== 0. 全局常量 & 状态 ===============

const copySupabase = window.supabaseClient || null;

// 文案分类单独一套 key，避免和标题混在一起
const COPY_DEFAULT_CATEGORIES = ['全部', '笔记开头', '笔记结尾', '引导评论', '引导私信'];
const COPY_CATEGORY_LS_KEY = 'copy_categories_v1';

// 显示设置与标题页共用同一套
const COPY_DISPLAY_SETTINGS_KEY = 'display_settings_v1';
const COPY_DEFAULT_DISPLAY_SETTINGS = {
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

// 文案快照表：与标题分开
const COPY_SNAPSHOT_TABLE = 'copy_snapshots';
const COPY_SNAPSHOT_DEFAULT_KEY = 'default'; // 预留占位，不在列表展示

const copyState = {
  copies: [], // 当前所有文案记录（来自 Supabase.copies）
  categories: [...COPY_DEFAULT_CATEGORIES],
  currentCategory: '全部',
  filters: {
    search: '',
    scene: ''
  },
  editingId: null, // 当前弹窗编辑的 id（null = 新增）
  viewSettings: {}, // 显示设置（与 DISPLAY_SETTINGS_KEY 同步）
  isSortingCategories: false
};

let copyToastTimer = null;

// =============== 0.1 显示设置：沿用和标题页同一份配置 ===============

function copyGetDisplaySettings() {
  const raw = localStorage.getItem(COPY_DISPLAY_SETTINGS_KEY);
  if (!raw) return { ...COPY_DEFAULT_DISPLAY_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    return {
      ...COPY_DEFAULT_DISPLAY_SETTINGS,
      ...parsed,
      scenes: scenes.length ? scenes : [...COPY_DEFAULT_DISPLAY_SETTINGS.scenes]
    };
  } catch (e) {
    console.error('[CopyApp] 解析显示设置失败', e);
    return { ...COPY_DEFAULT_DISPLAY_SETTINGS };
  }
}

function copyApplyDisplaySettings() {
  const settings = copyGetDisplaySettings();

  copyState.viewSettings = { ...settings };

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
    topbarTitle.textContent =
      settings.titleText || COPY_DEFAULT_DISPLAY_SETTINGS.titleText;
    topbarTitle.style.color = settings.titleColor;
  }

  copyRenderSceneFilterOptions(settings);
}

function copyRenderSceneFilterOptions(settings) {
  const filterScene = document.getElementById('copyFilterScene');
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
    copyState.filters.scene = '';
  }
}

// =============== 1. 初始化入口 ===============

document.addEventListener('DOMContentLoaded', () => {
  console.log('[CopyApp] DOMContentLoaded: init');

  // 应用显示设置
  copyApplyDisplaySettings();

  // 分类
  copyLoadCategoriesFromLocal();
  copyRenderCategoryList();
  copyBindCategoryButtons();
  copySetupMobileCategoryDropdown();

  // 工具栏 / 弹窗 / 云端
  copyBindToolbar();
  copyBindCopyModal();
  copyBindImportModal();
  copyBindCloudButtons();

  if (!copySupabase) {
    console.warn('[CopyApp] supabaseClient 不存在，云端功能不可用');
  } else {
    console.log('[CopyApp] supabaseClient 已就绪');
  }

  // 初始从云端加载一遍 copies
  copyLoadCopiesFromCloud();
});

// =============== 2. 分类逻辑（文案专用） ===============

function copyLoadCategoriesFromLocal() {
  const raw = localStorage.getItem(COPY_CATEGORY_LS_KEY);
  if (!raw) {
    copyState.categories = [...COPY_DEFAULT_CATEGORIES];
    return;
  }
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) {
      copyState.categories = [...COPY_DEFAULT_CATEGORIES];
    } else {
      const set = new Set(arr);
      set.delete('全部');
      copyState.categories = ['全部', ...set];
    }
  } catch (e) {
    console.error('[CopyApp] copyLoadCategoriesFromLocal error', e);
    copyState.categories = [...COPY_DEFAULT_CATEGORIES];
  }
}

function copySaveCategoriesToLocal() {
  localStorage.setItem(COPY_CATEGORY_LS_KEY, JSON.stringify(copyState.categories));
}

function copyRenderCategoryList() {
  const list = document.getElementById('copyCategoryList');
  if (!list) return;

  list.innerHTML = '';

  copyState.categories.forEach((cat, index) => {
    const li = document.createElement('li');
    li.className =
      'category-item' + (cat === copyState.currentCategory ? ' active' : '');
    li.dataset.cat = cat;

    // 左侧：分类名
    const nameSpan = document.createElement('span');
    nameSpan.className = 'category-name';
    nameSpan.textContent = cat;

    // 右侧：数量 + 排序按钮
    const rightSpan = document.createElement('span');
    rightSpan.className = 'category-right';

    let count = 0;
    if (cat === '全部') {
      count = copyState.copies.length;
    } else {
      count = copyState.copies.filter((t) => t.main_category === cat).length;
    }
    const countSpan = document.createElement('span');
    countSpan.className = 'category-count';
    countSpan.textContent = `${count}条`;
    rightSpan.appendChild(countSpan);

    if (copyState.isSortingCategories && cat !== '全部') {
      const controls = document.createElement('span');
      controls.className = 'category-sort-controls';

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.textContent = '↑';
      btnUp.className = 'function-btn ghost text-xs btn-inline';
      btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        copyReorderCategory(index, -1);
      });

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.textContent = '↓';
      btnDown.className = 'function-btn ghost text-xs btn-inline';
      btnDown.style.marginLeft = '4px';
      btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        copyReorderCategory(index, 1);
      });

      controls.appendChild(btnUp);
      controls.appendChild(btnDown);
      rightSpan.appendChild(controls);
    }

    li.addEventListener('click', () => {
      copyState.currentCategory = cat;
      copyRenderCategoryList();
      copyRenderCopies();
    });

    li.appendChild(nameSpan);
    li.appendChild(rightSpan);
    list.appendChild(li);
  });

  copyUpdateMobileCategoryLabel();
}

function copyReorderCategory(index, delta) {
  const newIndex = index + delta;

  if (index <= 0) return;
  if (newIndex <= 0) return;
  if (newIndex >= copyState.categories.length) return;

  const arr = [...copyState.categories];
  const item = arr[index];
  arr.splice(index, 1);
  arr.splice(newIndex, 0, item);
  copyState.categories = arr;

  copySaveCategoriesToLocal();
  copyRenderCategoryList();
}

// =============== 2.5 手机端分类下拉（文案） ===============

function copySetupMobileCategoryDropdown() {
  const wrapper = document.getElementById('copyMobileCategoryWrapper');
  const toggleBtn = document.getElementById('copyMobileCategoryToggle');
  const list = document.getElementById('copyCategoryList');

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

function copyUpdateMobileCategoryLabel() {
  const labelEl = document.getElementById('copyMobileCategoryLabel');
  if (!labelEl) return;
  labelEl.textContent = copyState.currentCategory || '全部';
}

// =============== 3. 工具栏：搜索 / 场景筛选 / 按钮（文案） ===============

function copyBindToolbar() {
  const searchInput = document.getElementById('copySearchInput');
  const btnClearSearch = document.getElementById('copyBtnClearSearch');
  const filterScene = document.getElementById('copyFilterScene');

  const btnNewCopy = document.getElementById('btnNewCopy');
  const btnBatchImport = document.getElementById('btnCopyBatchImport');
  const btnClearAll = document.getElementById('btnCopyClearAll');

  if (searchInput) {
    const syncClearBtn = () => {
      if (!btnClearSearch) return;
      btnClearSearch.style.display = searchInput.value ? 'inline-flex' : 'none';
    };

    searchInput.addEventListener('input', (e) => {
      copyState.filters.search = e.target.value.trim();
      copyRenderCopies();
      syncClearBtn();
    });

    syncClearBtn();

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        copyState.filters.search = '';
        copyRenderCopies();
        syncClearBtn();
      });
    }
  }

  if (filterScene) {
    filterScene.addEventListener('change', (e) => {
      copyState.filters.scene = e.target.value;
      copyRenderCopies();
    });
  }

  if (btnNewCopy) {
    btnNewCopy.addEventListener('click', () => {
      console.log('[CopyApp] 点击 新增文案');
      openCopyModal();
    });
  }

  if (btnBatchImport) {
    btnBatchImport.addEventListener('click', () => {
      console.log('[CopyApp] 点击 批量导入文案');
      openCopyImportModal();
    });
  }

  // 清空全部文案
  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (!confirm('确定清空全部文案？此操作不可恢复')) return;
      if (!copySupabase) {
        copyShowToast('Supabase 未配置，无法清空云端', 'error');
        return;
      }
      try {
        const { error } = await copySupabase
          .from('copies')
          .delete()
          .not('id', 'is', null);
        if (error) throw error;

        copyState.copies = [];
        copyRenderCopies();
        copyShowToast('已清空全部文案');
      } catch (e) {
        console.error('[CopyApp] 清空全部文案失败', e);
        copyShowToast('清空失败： ' + (e.message || ''), 'error');
      }
    });
  }
}

// =============== 4. 加载 & 过滤 & 渲染文案列表 ===============

async function copyLoadCopiesFromCloud() {
  if (!copySupabase) {
    console.warn('[CopyApp] supabaseClient 不存在，跳过云端加载 copies');
    return;
  }
  try {
    const { data, error } = await copySupabase
      .from('copies')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    copyState.copies = data || [];
    console.log('[CopyApp] 从云端加载文案条数：', copyState.copies.length);
    copyRenderCategoryList();
    copyRenderCopies();
  } catch (e) {
    console.error('[CopyApp] copyLoadCopiesFromCloud error', e);
    copyShowToast('加载文案失败', 'error');
  }
}

function copyApplyFilters(list) {
  const cat = copyState.currentCategory;
  const q = copyState.filters.search.toLowerCase();
  const scene = copyState.filters.scene;

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

function copyRenderCopies() {
  const tbody = document.getElementById('copyTableBody');
  const mobileList = document.getElementById('copyMobileList');
  if (!tbody || !mobileList) return;

  tbody.innerHTML = '';
  mobileList.innerHTML = '';

  const list = copyApplyFilters(copyState.copies);

  list.forEach((item, index) => {
    // 桌面端行
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

    const tdActions = document.createElement('td');
    tdActions.className = 'actions-cell';

    const group = document.createElement('div');
    group.className = 'action-group';

    const btnCopy = document.createElement('button');
    btnCopy.className = 'function-btn ghost text-xs btn-inline';
    btnCopy.textContent = '复制';
    btnCopy.addEventListener('click', () => copyCopyToClipboard(item));

    const btnEdit = document.createElement('button');
    btnEdit.className = 'function-btn ghost text-xs btn-inline';
    btnEdit.textContent = '修改';
    btnEdit.addEventListener('click', () => openCopyModal(item));

    const btnDel = document.createElement('button');
    btnDel.className = 'function-btn ghost text-xs btn-inline';
    btnDel.textContent = '删除';
    btnDel.addEventListener('click', () => deleteCopy(item));

    group.append(btnCopy, btnEdit, btnDel);
    tdActions.appendChild(group);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);

    // 移动端卡片
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
    mCopy.addEventListener('click', () => copyCopyToClipboard(item));

    const mEdit = document.createElement('button');
    mEdit.className = 'function-btn ghost text-xs btn-inline';
    mEdit.textContent = '修改';
    mEdit.addEventListener('click', () => openCopyModal(item));

    const mDel = document.createElement('button');
    mDel.className = 'function-btn ghost text-xs btn-inline';
    mDel.textContent = '删除';
    mDel.addEventListener('click', () => deleteCopy(item));

    actions.append(mCopy, mEdit, mDel);
    headerRow.append(cTitle, actions);

    card.append(headerRow);
    mobileList.appendChild(card);
  });

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-xs text-gray-500 py-2';
    empty.textContent = '暂无文案，请先新增。';
    mobileList.appendChild(empty);
  }
}

// =============== 5. 文案操作：复制 / 删除 ===============

async function copyCopyToClipboard(item) {
  try {
    await navigator.clipboard.writeText(item.text || '');
    copyShowToast('已复制文案');
  } catch (e) {
    console.error('[CopyApp] 复制文案失败', e);
    copyShowToast('复制失败', 'error');
  }

  if (!copySupabase || !item.id) return;

  try {
    const newCount = (item.usage_count || 0) + 1;

    await copySupabase
      .from('copies')
      .update({ usage_count: newCount })
      .eq('id', item.id);

    const idx = copyState.copies.findIndex((t) => t.id === item.id);
    if (idx !== -1) {
      copyState.copies[idx] = {
        ...copyState.copies[idx],
        usage_count: newCount
      };
    }
  } catch (e) {
    console.error('[CopyApp] 更新文案 usage_count 失败', e);
  }
}

async function deleteCopy(item) {
  if (!confirm('确定删除该文案？')) return;

  copyState.copies = copyState.copies.filter((t) => t.id !== item.id);
  copyRenderCopies();

  if (!copySupabase || !item.id) return;

  try {
    await copySupabase.from('copies').delete().eq('id', item.id);
    copyShowToast('已删除文案');
  } catch (e) {
    console.error('[CopyApp] 删除文案失败', e);
    copyShowToast('删除失败（云端）', 'error');
  }
}

// =============== 6. 文案弹窗 ===============

function copyBindCopyModal() {
  const btnClose = document.getElementById('btnCloseCopyModal');
  const btnCancel = document.getElementById('btnCancelCopyModal');
  const btnSave = document.getElementById('btnSaveCopy');

  if (btnClose) btnClose.addEventListener('click', closeCopyModal);
  if (btnCancel) btnCancel.addEventListener('click', closeCopyModal);
  if (btnSave) btnSave.addEventListener('click', saveCopyFromModal);
}

function openCopyModal(item) {
  const modal = document.getElementById('copyModal');
  if (!modal) return;

  const titleEl = document.getElementById('copyModalTitle');
  const textEl = document.getElementById('copyFieldText');
  const mainCatEl = document.getElementById('copyFieldMainCategory');
  const typeEl = document.getElementById('copyFieldContentType');
  const sceneEl = document.getElementById('copyFieldSceneTags');

  copyRefreshModalCategoryOptions(mainCatEl);

  if (item && item.id) {
    copyState.editingId = item.id;
    if (titleEl) titleEl.textContent = '修改文案';
    if (textEl) textEl.value = item.text || '';
    if (mainCatEl) mainCatEl.value = item.main_category || '';
    if (typeEl) typeEl.value = item.content_type || '';
    if (sceneEl)
      sceneEl.value = Array.isArray(item.scene_tags)
        ? item.scene_tags.join(', ')
        : '';
  } else {
    copyState.editingId = null;
    if (titleEl) titleEl.textContent = '新增文案';
    if (textEl) textEl.value = '';
    if (mainCatEl)
      mainCatEl.value =
        copyState.currentCategory === '全部' ? '' : copyState.currentCategory;
    if (typeEl) typeEl.value = '';
    if (sceneEl) sceneEl.value = '';
  }

  modal.classList.remove('hidden');
}

function closeCopyModal() {
  const modal = document.getElementById('copyModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function copyRefreshModalCategoryOptions(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = '';

  const cats = copyState.categories.filter((c) => c !== '全部');
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

async function saveCopyFromModal() {
  const fieldText = document.getElementById('copyFieldText');
  const fieldCat = document.getElementById('copyFieldMainCategory');
  const fieldType = document.getElementById('copyFieldContentType');
  const fieldScene = document.getElementById('copyFieldSceneTags');

  if (!fieldText || !fieldCat || !fieldType || !fieldScene) return;

  const text = fieldText.value.trim();
  const cat = fieldCat.value || null;
  const type = fieldType.value || null;
  const sceneRaw = fieldScene.value.trim();

  if (!text) {
    copyShowToast('文案内容不能为空', 'error');
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
    '[CopyApp] 保存文案 payload =',
    payload,
    'editingId =',
    copyState.editingId
  );

  if (!copySupabase) {
    copyShowToast('未配置 Supabase，无法保存到云端', 'error');
    return;
  }

  const prevCategory = copyState.currentCategory;

  try {
    if (copyState.editingId) {
      const { error } = await copySupabase
        .from('copies')
        .update(payload)
        .eq('id', copyState.editingId);

      if (error) throw error;

      const idx = copyState.copies.findIndex((t) => t.id === copyState.editingId);
      if (idx !== -1) {
        copyState.copies[idx] = {
          ...copyState.copies[idx],
          ...payload
        };
      }

      copyShowToast('文案已更新');
    } else {
      const insertPayload = {
        ...payload,
        usage_count: 0
      };

      const { data, error } = await copySupabase
        .from('copies')
        .insert([insertPayload])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        copyState.copies.push(data);
      }

      copyShowToast('文案已新增');
    }

    copyState.currentCategory = prevCategory;
    copyRenderCategoryList();
    copyRenderCopies();
    closeCopyModal();
  } catch (e) {
    console.error('[CopyApp] 保存文案失败', e);
    copyShowToast('保存失败：' + (e.message || ''), 'error');
  }
}

// =============== 7. 批量导入文案 ===============

function copyBindImportModal() {
  const btnClose = document.getElementById('btnCloseCopyImport');
  const btnCancel = document.getElementById('btnCancelCopyImport');
  const btnRun = document.getElementById('btnRunCopyImport');

  if (btnClose) btnClose.addEventListener('click', closeCopyImportModal);
  if (btnCancel) btnCancel.addEventListener('click', closeCopyImportModal);
  if (btnRun) btnRun.addEventListener('click', runCopyImport);
}

function openCopyImportModal() {
  const modal = document.getElementById('copyImportModal');
  if (!modal) return;

  const rawInput = document.getElementById('copyImportRawInput');
  if (rawInput) rawInput.value = '';

  modal.classList.remove('hidden');
}

function closeCopyImportModal() {
  const modal = document.getElementById('copyImportModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

async function runCopyImport() {
  const rawInput = document.getElementById('copyImportRawInput');
  if (!rawInput) return;

  const raw = rawInput.value || '';
  const lines = raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!lines.length) {
    copyShowToast('没有可导入的文案内容', 'error');
    return;
  }

  if (!copySupabase) {
    copyShowToast('未配置 Supabase，无法导入云端', 'error');
    return;
  }

  const rows = lines.map((text) => ({
    text,
    main_category:
      copyState.currentCategory === '全部' ? null : copyState.currentCategory,
    content_type: null,
    scene_tags: [],
    usage_count: 0
  }));

  try {
    const { error } = await copySupabase.from('copies').insert(rows);
    if (error) throw error;
    copyShowToast(`批量导入文案成功，共 ${rows.length} 条`);
    closeCopyImportModal();
    await copyLoadCopiesFromCloud();
  } catch (e) {
    console.error('[CopyApp] 批量导入文案失败', e);
    copyShowToast('云端导入失败', 'error');
  }
}

// =============== 8. 云端快照：保存 / 加载 / 列表（文案） ===============

function copyCollectSnapshotPayload() {
  const currentSettings = copyGetDisplaySettings();
  copyState.viewSettings = { ...currentSettings };

  return {
    ver: 1,
    snapshot_label: '',
    updated_at: Date.now(),
    copies: copyState.copies,
    categories: copyState.categories,
    viewSettings: currentSettings
  };
}

function copyApplySnapshotPayload(payload) {
  if (!payload) return;

  copyState.copies = Array.isArray(payload.copies) ? payload.copies : [];
  copyState.categories = Array.isArray(payload.categories)
    ? payload.categories
    : [...COPY_DEFAULT_CATEGORIES];

  const newViewSettings =
    payload.viewSettings && Object.keys(payload.viewSettings).length
      ? payload.viewSettings
      : copyGetDisplaySettings();

  copyState.viewSettings = { ...newViewSettings };

  try {
    localStorage.setItem(
      COPY_DISPLAY_SETTINGS_KEY,
      JSON.stringify(newViewSettings)
    );
  } catch (e) {
    console.error('[CopyApp] 写入显示设置失败', e);
  }

  copyApplyDisplaySettings();
  copySaveCategoriesToLocal();
  copyRenderCategoryList();
  copyRenderCopies();
}

// 把快照 copies 写回 Supabase.copies
async function copySyncSnapshotCopiesToCloud(copies) {
  if (!copySupabase) {
    alert('未配置 Supabase');
    return;
  }
  if (!Array.isArray(copies)) return;

  try {
    const { error: delError } = await copySupabase
      .from('copies')
      .delete()
      .not('id', 'is', null);
    if (delError) throw delError;

    if (copies.length > 0) {
      const { error: insertError } = await copySupabase.from('copies').insert(
        copies.map((t) => ({
          text: t.text,
          main_category: t.main_category || null,
          content_type: t.content_type || null,
          scene_tags: Array.isArray(t.scene_tags) ? t.scene_tags : [],
          usage_count: t.usage_count || 0
        }))
      );
      if (insertError) throw insertError;
    }

    copyShowToast('文案快照数据已同步到云端');
    await copyLoadCopiesFromCloud();
  } catch (e) {
    console.error('[CopyApp] copySyncSnapshotCopiesToCloud error', e);
    alert('同步文案快照到云端失败：' + (e.message || 'Unknown error'));
  }
}

// 可指定 label / key 的通用保存（留给“统一保存标题+文案”用）
async function copySaveCloudSnapshotWithKeyAndLabel(label, key) {
  if (!copySupabase) {
    alert('未配置 Supabase');
    return;
  }

  const safeLabel = (label || '').trim();
  if (!safeLabel) {
    alert('快照名称不能为空');
    return;
  }

  const payload = copyCollectSnapshotPayload();
  payload.snapshot_label = safeLabel;

  const finalKey = key || `manual_${Date.now()}`;

  try {
    const { error } = await copySupabase.from(COPY_SNAPSHOT_TABLE).upsert(
      [
        {
          key: finalKey,
          payload,
          updated_at: new Date().toISOString()
        }
      ],
      { onConflict: 'key' }
    );

    if (error) throw error;

    copyShowToast('文案云端快照已保存');
  } catch (e) {
    console.error('[CopyApp] copySaveCloudSnapshotWithKeyAndLabel error', e);
    alert('保存文案快照失败：' + (e.message || 'Unknown error'));
  }
}

// 给文案页自己的“保存云端”按钮用
async function copySaveCloudSnapshot() {
  if (!copySupabase) {
    alert('未配置 Supabase');
    return;
  }

  const label = prompt('请输入这次文案快照的备注名称：', '');
  if (label === null) return;

  await copySaveCloudSnapshotWithKeyAndLabel(label, null);
}

async function copyLoadCloudSnapshot(key, options = {}) {
  const { skipConfirm = false } = options;

  if (!copySupabase) {
    alert('未配置 Supabase');
    return;
  }
  try {
    const { data, error } = await copySupabase
      .from(COPY_SNAPSHOT_TABLE)
      .select('payload')
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;
    if (!data || !data.payload) {
      alert('未找到该文案快照');
      return;
    }

    if (!skipConfirm) {
      const ok = confirm('确定使用此文案快照覆盖当前数据？');
      if (!ok) return;
    }

    const payload = data.payload;

    copyApplySnapshotPayload(payload);
    await copySyncSnapshotCopiesToCloud(payload.copies || []);
    copyShowToast('已加载文案快照并覆盖云端');
  } catch (e) {
    console.error('[CopyApp] copyLoadCloudSnapshot error', e);
    alert('加载文案快照失败：' + (e.message || 'Unknown error'));
  }
}

async function copyRenderCloudHistoryList(anchorBtn) {
  if (!copySupabase) {
    alert('未配置 Supabase');
    return;
  }

  const panel = document.getElementById('copyCloudHistoryPanel');
  if (!panel) return;

  panel.classList.remove('hidden');
  panel.style.display = 'block';
  panel.innerHTML =
    '<div style="padding:8px 10px;font-size:12px;color:#6b7280;">加载中…</div>';

  const rect = anchorBtn.getBoundingClientRect();
  const scrollTop =
    window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft =
    window.pageXOffset || document.documentElement.scrollLeft;

  let left = rect.left + scrollLeft;
  const top = rect.bottom + scrollTop + 8;

  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const panelWidth = 260;
  const margin = 8;

  const maxLeft = scrollLeft + viewportWidth - panelWidth - margin;
  const minLeft = scrollLeft + margin;

  if (left > maxLeft) left = Math.max(minLeft, maxLeft);
  if (left < minLeft) left = minLeft;

  panel.style.top = top + 'px';
  panel.style.left = left + 'px';

  try {
    const { data, error } = await copySupabase
      .from(COPY_SNAPSHOT_TABLE)
      .select('key, payload, updated_at')
      .neq('key', COPY_SNAPSHOT_DEFAULT_KEY)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!data || data.length === 0) {
      panel.innerHTML =
        '<div style="padding:8px 10px;font-size:12px;color:#6b7280;">暂无文案快照</div>';
      return;
    }

    const rows = data.map((row) => {
      const p = row.payload || {};
      const label = p.snapshot_label || '(未命名)';
      const updated = row.updated_at
        ? new Date(row.updated_at).toLocaleString()
        : '';
      const count = Array.isArray(p.copies) ? p.copies.length : 0;

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
        const ok = confirm('确定使用此文案快照覆盖当前数据？');
        if (!ok) return;

        await copyLoadCloudSnapshot(key, { skipConfirm: true });

        panel.classList.add('hidden');
        panel.style.display = 'none';
      });
    });
  } catch (e) {
    console.error('[CopyApp] copyRenderCloudHistoryList error', e);
    panel.innerHTML =
      '<div style="padding:8px 10px;color:#f43f5e;">加载文案快照失败</div>';
  }
}

function copyToggleCloudHistoryPanel() {
  const panel = document.getElementById('copyCloudHistoryPanel');
  const btn = document.getElementById('btnCopyLoadCloud');
  if (!panel || !btn) return;

  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    panel.style.display = 'none';
    return;
  }

  copyRenderCloudHistoryList(btn);
}

// =============== 9. 分类按钮（文案） ===============

function copyBindCategoryButtons() {
  const btnAdd = document.getElementById('btnCopyAddCategory');
  const btnDel = document.getElementById('btnCopyDeleteCategory');
  const btnSort = document.getElementById('btnCopySortCategory');

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      const name = prompt('请输入新的文案分类名称：', '');
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      if (copyState.categories.includes(trimmed)) {
        alert('已存在同名分类');
        return;
      }

      copyState.categories.push(trimmed);
      copySaveCategoriesToLocal();
      copyRenderCategoryList();
      copyShowToast('文案分类已新增');
    });
  }

  if (btnDel) {
    btnDel.addEventListener('click', () => {
      const cat = copyState.currentCategory;
      if (!cat || cat === '全部') {
        alert('不能删除「全部」分类');
        return;
      }
      const ok = confirm(
        `确定删除文案分类「${cat}」？（不会删除文案，只是移除分类标签）`
      );
      if (!ok) return;

      copyState.categories = copyState.categories.filter((c) => c !== cat);
      copyState.copies = copyState.copies.map((t) =>
        t.main_category === cat ? { ...t, main_category: null } : t
      );

      copyState.currentCategory = '全部';
      copySaveCategoriesToLocal();
      copyRenderCategoryList();
      copyRenderCopies();
      copyShowToast('文案分类已删除');
    });
  }

  if (btnSort) {
    btnSort.addEventListener('click', () => {
      copyState.isSortingCategories = !copyState.isSortingCategories;
      copyRenderCategoryList();
      copyShowToast(
        copyState.isSortingCategories
          ? '文案分类排序模式已开启（点击↑↓调整顺序）'
          : '已退出文案分类排序模式'
      );
    });
  }
}

function copyBindCloudButtons() {
  const btnSave = document.getElementById('btnCopySaveCloud');
  const btnLoad = document.getElementById('btnCopyLoadCloud');

  if (btnSave) btnSave.addEventListener('click', copySaveCloudSnapshot);
  if (btnLoad) btnLoad.addEventListener('click', copyToggleCloudHistoryPanel);
}

// =============== 10. Toast（文案页） ===============

function copyShowToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;

  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.background =
    type === 'error' ? 'rgba(220,38,38,0.92)' : 'rgba(17,24,39,0.92)';

  clearTimeout(copyToastTimer);
  copyToastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, 1800);
}

// =============== 11. 暴露给 HTML / 其他页面的全局函数 ===============

window.openCopyModal = openCopyModal;
window.openCopyImportModal = openCopyImportModal;

window.CopyApp = {
  // 列表数据
  loadCopiesFromCloud: copyLoadCopiesFromCloud,
  applyFilters: copyApplyFilters,
  renderCopies: copyRenderCopies,

  // 显示设置
  getDisplaySettings: copyGetDisplaySettings,
  applyDisplaySettings: copyApplyDisplaySettings,

  // 快照相关
  collectSnapshotPayload: copyCollectSnapshotPayload,
  applySnapshotPayload: copyApplySnapshotPayload,
  saveCloudSnapshot: copySaveCloudSnapshot,
  saveCloudSnapshotWithKeyAndLabel: copySaveCloudSnapshotWithKeyAndLabel,
  loadCloudSnapshot: copyLoadCloudSnapshot,
  syncSnapshotCopiesToCloud: copySyncSnapshotCopiesToCloud
};
