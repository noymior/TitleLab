// assets/app-title.js
// 标题管理主逻辑（桌面表格 + 手机卡片 + 云端快照）

console.log('[TitleApp] app-title.js loaded');

// =============== 0. 全局常量 & 状态 ===============

const supabase = window.supabaseClient || null;

const DEFAULT_CATEGORIES = ['全部', '亲子', '情侣', '闺蜜', '单人', '烟花', '夜景'];
const CATEGORY_LS_KEY = 'title_categories_v1';
const DISPLAY_SETTINGS_KEY = 'display_settings_v1';
const DEFAULT_DISPLAY_SETTINGS = {
  brandColor: '#1990ff',
  brandHover: '#1477dd',
  ghostColor: '#eef2ff',
  ghostHover: '#e2e8ff',
  stripeColor: '#E2F0FF',
  hoverColor: '#eef2ff',
  scenes: ['港迪城堡', '烟花', '夜景', '香港街拍'],
  titleText: '标题与文案管理系统',
  titleColor: '#1990ff'
};

const SNAPSHOT_TABLE = 'snapshots';
const SNAPSHOT_DEFAULT_KEY = 'default';

const state = {
  titles: [], // 当前所有标题记录（来自 Supabase.titles）
  categories: [...DEFAULT_CATEGORIES],
  currentCategory: '全部',
  renamingCategory: null, // 正在重命名的分类名称
  filters: {
    search: '',
    scene: ''
  },
  editingId: null, // 当前弹窗编辑的 id（null = 新增）
  viewSettings: {}, // 预留
  isSortingCategories: false // 分类是否处在“排序模式”
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
  if (topbarTitle) topbarTitle.removeAttribute('style');

  renderSceneFilterOptions(settings);
}

function renderSceneFilterOptions(settings) {
  const filterScene = document.getElementById('filterScene');
  if (!filterScene) return;
  const prevValue = filterScene.value;
  filterScene.innerHTML = '<option value="">账号分类</option>';
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

// =============== 1. 初始化入口 ===============

// 允许登录的用户列表（与 login.html 保持一致）
const ALLOWED_USERS = ['sevenoy', 'olina'];

function validateUser(user) {
  if (!user || !user.username) return false;
  return ALLOWED_USERS.includes(user.username);
}

document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (!user || !validateUser(user)) { 
    // 清除无效的用户信息
    try { localStorage.removeItem('current_user_v1'); } catch (_) {}
    window.location.href = 'login.html'; 
    return; 
  }
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
  bindRenameCategoryModal();
  bindCloudButtons();
  bindGlobalNavButtons();

  const badge = document.getElementById('currentUserName');
  if (badge) {
    // 获取用户名简写
    const userInitial = getUserInitial(user.username);
    badge.textContent = userInitial;
    badge.className = 'user-badge text-xs';
  }
  const btnLogout = document.getElementById('btnLogout');
  const btnLoginHeader = document.getElementById('btnLoginHeader');
  if (btnLogout) btnLogout.onclick = () => { try { localStorage.removeItem('current_user_v1'); } catch (_) {} window.location.href = 'login.html'; };
  if (btnLoginHeader) btnLoginHeader.onclick = () => { window.location.href = 'login.html'; };
  if (btnLogout) btnLogout.classList.remove('hidden');
  if (btnLoginHeader) btnLoginHeader.classList.add('hidden');

  if (!supabase) {
    console.warn('[TitleApp] supabaseClient 不存在，云端功能不可用');
  } else {
    console.log('[TitleApp] supabaseClient 已就绪');
  }

  // 初始从云端加载一遍 titles
  loadTitlesFromCloud();
});

function getCurrentUser() {
  try { const raw = localStorage.getItem('current_user_v1'); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}

// 获取用户名简写
function getUserInitial(username) {
  if (!username) return '';
  const userInitials = {
    'sevenoy': 'S',
    'olina': 'O'
  };
  return userInitials[username.toLowerCase()] || username.charAt(0).toUpperCase();
}

function userTag(u) { return `user:${u}`; }

function stripLeadingIndex(s) {
  return (s || '').replace(/^\s*\d+(?:\.\d+)*(?:[\.)、．])?\s*/, '');
}

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

    // 左侧：分类名（排序模式下可编辑）
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
      btnUp.innerHTML = '▲';
      btnUp.className = 'function-btn ghost text-xs btn-inline';
      btnUp.style.marginLeft = '4px';
      btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderCategory(index, -1);
      });

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.innerHTML = '▼';
      btnDown.className = 'function-btn ghost text-xs btn-inline';
      btnDown.style.marginLeft = '4px';
      btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderCategory(index, 1);
      });

      const btnRename = document.createElement('button');
      btnRename.type = 'button';
      btnRename.textContent = '改';
      btnRename.className = 'function-btn ghost text-xs btn-inline';
      btnRename.style.marginLeft = '4px';
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('[TitleApp] 点击改按钮，分类名称：', cat);
        openRenameCategoryModal(cat);
      });

      controls.appendChild(btnUp);
      controls.appendChild(btnDown);
      controls.appendChild(btnRename);
      rightSpan.appendChild(controls);
    }

    // 普通点击：切换当前分类（排序模式下禁用）
    li.addEventListener('click', (e) => {
      // 如果点击的是按钮，不处理
      if (e.target.closest('button')) return;
      // 排序模式下不切换分类
      if (state.isSortingCategories) return;
      
      state.currentCategory = cat;
      renderCategoryList();
      renderTitles();
      const panel = document.getElementById('cloudHistoryPanel');
      if (panel) {
        panel.classList.add('hidden');
        panel.style.display = 'none';
      }
      const wrapper = document.getElementById('mobileCategoryWrapper');
      const dl = document.getElementById('categoryList');
      if (wrapper && dl) {
        wrapper.setAttribute('data-open', '0');
        if (window.innerWidth < 768) dl.style.display = 'none';
      }
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

// 修改分类名称 - 打开模态框
function openRenameCategoryModal(oldName) {
  if (!oldName || oldName === '全部') {
    showToast('不能修改"全部"分类', 'error');
    return;
  }
  
  const modal = document.getElementById('renameCategoryModal');
  const input = document.getElementById('renameCategoryInput');
  if (!modal || !input) return;
  
  input.value = oldName;
  state.renamingCategory = oldName;
  modal.classList.remove('hidden');
  input.focus();
  input.select();
}

// 关闭修改分类名称模态框
function closeRenameCategoryModal() {
  const modal = document.getElementById('renameCategoryModal');
  const input = document.getElementById('renameCategoryInput');
  if (modal) modal.classList.add('hidden');
  if (input) input.value = '';
  state.renamingCategory = null;
}

// 修改分类名称 - 执行修改
async function renameCategory() {
  const oldName = state.renamingCategory;
  const input = document.getElementById('renameCategoryInput');
  
  if (!oldName || !input) return;
  
  const newName = input.value.trim();
  
  if (!newName || newName === oldName) {
    closeRenameCategoryModal();
    return;
  }
  
  if (newName === '全部') {
    showToast('不能使用"全部"作为分类名称', 'error');
    return;
  }
  
  // 检查新名称是否已存在
  if (state.categories.includes(newName)) {
    showToast('分类名称已存在', 'error');
    return;
  }
  
  // 更新 state.categories
  const catIndex = state.categories.indexOf(oldName);
  if (catIndex === -1) {
    closeRenameCategoryModal();
    return;
  }
  
  state.categories[catIndex] = newName;
  
  // 更新 localStorage
  saveCategoriesToLocal();
  
  // 如果当前分类是被修改的分类，也要更新
  if (state.currentCategory === oldName) {
    state.currentCategory = newName;
  }
  
  // 更新数据库中的所有相关记录
  if (supabase) {
    try {
      const { error } = await supabase
        .from('titles')
        .update({ main_category: newName })
        .eq('main_category', oldName);
      
      if (error) throw error;
      
      // 更新本地 state.titles
      state.titles.forEach((title) => {
        if (title.main_category === oldName) {
          title.main_category = newName;
        }
      });
      
      showToast('分类名称已更新');
    } catch (e) {
      console.error('[TitleApp] 更新分类名称失败', e);
      showToast('更新分类名称失败：' + (e.message || ''), 'error');
      // 回滚
      state.categories[catIndex] = oldName;
      saveCategoriesToLocal();
      if (state.currentCategory === newName) {
        state.currentCategory = oldName;
      }
      closeRenameCategoryModal();
      return;
    }
  }
  
  closeRenameCategoryModal();
  
  // 重新渲染
  renderCategoryList();
  renderTitles();
}

// 绑定修改分类名称模态框
function bindRenameCategoryModal() {
  const modal = document.getElementById('renameCategoryModal');
  const btnClose = document.getElementById('btnCloseRenameCategory');
  const btnCancel = document.getElementById('btnCancelRenameCategory');
  const btnConfirm = document.getElementById('btnConfirmRenameCategory');
  const input = document.getElementById('renameCategoryInput');
  
  if (btnClose) btnClose.addEventListener('click', closeRenameCategoryModal);
  if (btnCancel) btnCancel.addEventListener('click', closeRenameCategoryModal);
  if (btnConfirm) btnConfirm.addEventListener('click', renameCategory);
  
  // 点击背景关闭
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeRenameCategoryModal();
      }
    });
  }
  
  // 按 Enter 键确认
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        renameCategory();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeRenameCategoryModal();
      }
    });
  }
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

  if (btnClearAll) {
    btnClearAll.addEventListener('click', openClearConfirmModal);
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
      .from('titles')
      .select('*')
      // 改为按 created_at 倒序：最新在最上
      .order('created_at', { ascending: false });

    if (error) throw error;
    const user = getCurrentUser();
    const tag = user ? userTag(user.username) : null;
    const filtered = tag
      ? (data || []).filter((it) => Array.isArray(it.scene_tags) && it.scene_tags.includes(tag))
      : (data || []);
    state.titles = filtered;
    console.log('[TitleApp] 从云端加载标题条数：', state.titles.length);
    // 云端数据变化后，需要同步刷新分类数量
    renderCategoryList();
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

    // ⚠️ 不再显示 usage_count 列
    const tdActions = document.createElement('td');
    tdActions.className = 'actions-cell';

    const group = document.createElement('div');
    group.className = 'action-group';

    const btnCopy = document.createElement('button');
    btnCopy.className = 'function-btn text-xs btn-inline btn-rect';
    btnCopy.textContent = '复制';
    btnCopy.addEventListener('click', () => copyTitle(item));

    const btnEdit = document.createElement('button');
    btnEdit.className = 'function-btn ghost text-xs btn-inline btn-rect';
    btnEdit.textContent = '修改';
    btnEdit.addEventListener('click', () => openTitleModal(item));

    const btnDel = document.createElement('button');
    btnDel.className = 'function-btn ghost text-xs btn-inline btn-rect';
    btnDel.textContent = '删除';
    btnDel.addEventListener('click', () => openDeleteTitleModal(item));

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
    cTitle.className = 'text-sm font-medium flex-1 min-w-0 line-clamp-2 break-anywhere';
    {
      const full = (item.text || '').trim();
      const lines = full.split(/\r?\n/).filter(Boolean);
      let preview = '';
      if (lines.length >= 2) {
        preview = `${lines[0]} ${lines[1]}`;
      } else {
        preview = full;
      }
      const truncated = lines.length > 2 || (full.length > preview.length);
      if (truncated) preview = `${preview} …▼`;
      cTitle.textContent = preview;
    }

    const leftWrap = document.createElement('div');
    leftWrap.className = 'flex items-center gap-2 flex-1 min-w-0';
    const idxBadge = document.createElement('span');
    idxBadge.className = 'pill-muted';
    idxBadge.textContent = String(index + 1);
    if (((index + 1) % 2) === 0) {
      idxBadge.classList.add('alt');
    }
    leftWrap.append(idxBadge, cTitle);

    const actions = document.createElement('div');
    actions.className = 'flex gap-2 flex-shrink-0';

    const mCopy = document.createElement('button');
    mCopy.className = 'function-btn text-xs btn-inline';
    mCopy.textContent = '复制';
    mCopy.addEventListener('click', () => copyTitle(item));

    const mEdit = document.createElement('button');
    mEdit.className = 'function-btn ghost text-xs btn-inline';
    mEdit.textContent = '修改';
    mEdit.addEventListener('click', () => openTitleModal(item));

    const mDel = document.createElement('button');
    mDel.className = 'function-btn ghost text-xs btn-inline';
    mDel.textContent = '删除';
    mDel.addEventListener('click', () => openDeleteTitleModal(item));

    actions.append(mCopy, mEdit, mDel);
    headerRow.append(leftWrap, actions);

    card.append(headerRow);
    mobileList.appendChild(card);
  });

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-xs text-gray-500 py-2';
    empty.textContent = '暂无标题，请先新增。';
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
      .from('titles')
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

let pendingDeleteTitle = null;
function openDeleteTitleModal(item) {
  const modal = document.getElementById('deleteTitleModal');
  const btnClose = document.getElementById('btnCloseDeleteTitle');
  const btnCancel = document.getElementById('btnCancelDeleteTitle');
  const btnConfirm = document.getElementById('btnConfirmDeleteTitle');
  const previewEl = document.getElementById('deleteTitlePreview');
  if (!modal || !btnClose || !btnCancel || !btnConfirm) return;
  pendingDeleteTitle = item;
  if (previewEl) previewEl.textContent = (item.text || '').slice(0, 40);
  modal.classList.remove('hidden');
  const close = () => { modal.classList.add('hidden'); pendingDeleteTitle = null; };
  btnClose.onclick = close;
  btnCancel.onclick = close;
  btnConfirm.onclick = () => {
    if (pendingDeleteTitle) deleteTitle(pendingDeleteTitle);
    close();
  };
}

let pendingSnapshotKeyTitle = null;
function openCloudLoadConfirmTitle(key) {
  const modal = document.getElementById('cloudLoadConfirmModalTitle');
  const btnClose = document.getElementById('btnCloseCloudLoadConfirmTitle');
  const btnCancel = document.getElementById('btnCancelCloudLoadTitle');
  const btnConfirm = document.getElementById('btnConfirmCloudLoadTitle');
  if (!modal || !btnClose || !btnCancel || !btnConfirm) { return; }
  pendingSnapshotKeyTitle = key;
  modal.classList.remove('hidden');
  const panel = document.getElementById('cloudHistoryPanel');
  if (panel) { panel.classList.add('hidden'); panel.style.display = 'none'; }
  const close = () => { modal.classList.add('hidden'); pendingSnapshotKeyTitle = null; };
  btnClose.onclick = close;
  btnCancel.onclick = close;
  btnConfirm.onclick = async () => {
    if (pendingSnapshotKeyTitle) {
      await loadCloudSnapshot(pendingSnapshotKeyTitle, { skipConfirm: true });
    }
    close();
  };
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
    if (titleEl) titleEl.textContent = '修改标题';
    if (textEl) textEl.value = item.text || '';
    if (mainCatEl) mainCatEl.value = item.main_category || '';
    if (typeEl) typeEl.value = item.content_type || '';
    if (sceneEl)
      sceneEl.value = Array.isArray(item.scene_tags)
        ? item.scene_tags.join(', ')
        : '';
  } else {
    state.editingId = null;
    if (titleEl) titleEl.textContent = '新增标题';
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
  emptyOpt.textContent = '请选择';
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
    showToast('标题不能为空', 'error');
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
    scene_tags: Array.from(new Set([...(sceneTags || []), userTag(getCurrentUser().username)]))
  };

  console.log(
    '[TitleApp] 保存标题 payload =',
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
        .from('titles')
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

      showToast('标题已更新');
    } else {
      // ====== 情况二：新增标题 ======

      const insertPayload = {
        ...payload,
        usage_count: 0
      };

      // 要回写新插入的那条记录，所以加上 .select().single()
      const { data, error } = await supabase
        .from('titles')
        .insert([insertPayload])
        .select()
        .single();

      if (error) throw error;

      // 新增的加到数组头部，使最新一条在最上
      if (data) {
        state.titles.unshift(data);
      }

      showToast('标题已新增');
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

  const sel = document.getElementById('importCategorySelect');
  if (sel) {
    sel.innerHTML = '';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '请选择';
    sel.appendChild(emptyOpt);
    state.categories.filter((c) => c !== '全部').forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });
    sel.value = state.currentCategory === '全部' ? '' : state.currentCategory;
  }

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
    .map((s) => stripLeadingIndex(s).trim())
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
    main_category: (function(){
      const sel = document.getElementById('importCategorySelect');
      const v = sel && sel.value ? sel.value : null;
      return v;
    })(),
    content_type: null,
    scene_tags: [userTag(getCurrentUser().username)],
    usage_count: 0
  }));

  try {
    const { error } = await supabase.from('titles').insert(rows);
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

async function saveCloudSnapshot() {
  if (!window.snapshotService) {
    alert('未配置 Supabase');
    return;
  }
  const label = prompt('请输入这次快照的备注名称（例如：11月中旬版本）：', '');
  if (label === null) return;
  try {
    const info = await window.snapshotService.saveUnifiedSnapshotFromCloud(
      label.trim()
    );
    showToast(
      `已保存：标题 ${info.titleCount} 条 文案 ${info.contentCount} 条 ${info.updatedText}`
    );
  } catch (e) {
    console.error('[TitleApp] saveCloudSnapshot error', e);
    alert('保存快照失败：' + (e.message || 'Unknown error'));
  }
}

async function loadCloudSnapshot(key, options = {}) {
  if (!window.snapshotService) {
    alert('未配置 Supabase');
    return;
  }
  try {
    const info = await window.snapshotService.loadUnifiedSnapshot(key, 'both');
    await loadTitlesFromCloud();
    showToast(
      `已加载：标题 ${info.titleCount} 条 文案 ${info.contentCount} 条 ${info.updatedText}`
    );
  } catch (e) {
    console.error('[TitleApp] loadCloudSnapshot error', e);
    alert('加载快照失败：' + (e.message || 'Unknown error'));
  }
}

async function renderCloudHistoryList(anchorBtn) {
  if (!window.snapshotService) {
    alert('未配置 Supabase');
    return;
  }
  const panel = document.getElementById('cloudHistoryPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.style.display = 'block';
  panel.innerHTML =
    '<div style="padding:8px 10px;font-size:12px;color:#6b7280;">加载中…</div>';
  const rect = anchorBtn.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
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
    const list = await window.snapshotService.listUnified(5);
    if (!list || list.length === 0) {
      panel.innerHTML =
        '<div style="padding:8px 10px;font-size:12px;color:#6b7280;">暂无快照</div>';
      return;
    }
    const rows = list.map((it) => `
      <div class="cloud-item" data-key="${it.key}">
        <div class="cloud-item-main">
          <div class="cloud-item-name">${it.label}</div>
          <div class="cloud-item-meta">标题 ${it.titleCount} 条 · 文案 ${it.contentCount} 条 · ${it.updatedText}</div>
        </div>
      </div>
    `);
    panel.innerHTML = rows.join('');
    panel.querySelectorAll('.cloud-item').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.getAttribute('data-key');
        if (!key) return;
        openCloudLoadConfirmTitle(key);
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
function hideCloudHistoryPanel() {
  const panel = document.getElementById('cloudHistoryPanel');
  if (!panel) return;
  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    panel.style.display = 'none';
  }
}
document.addEventListener('click', (e) => {
  const panel = document.getElementById('cloudHistoryPanel');
  const btn = document.getElementById('btnLoadCloud');
  if (!panel || panel.classList.contains('hidden')) return;
  const target = e.target;
  if (btn && (btn === target || btn.contains(target))) return;
  if (panel.contains(target)) return;
  panel.classList.add('hidden');
  panel.style.display = 'none';
});

// =============== 9. 分类按钮：新增 / 删除 / 排序 ===============

function bindCategoryButtons() {
  const btnAdd = document.getElementById('btnAddCategory');
  const btnDel = document.getElementById('btnDeleteCategory');
  const btnSort = document.getElementById('btnSortCategory');

  if (btnAdd) {
    btnAdd.addEventListener('click', openAddCategoryModal);
  }

  if (btnDel) {
    btnDel.addEventListener('click', openDeleteCategoryModal);
  }

  if (btnSort) {
    btnSort.addEventListener('click', () => {
      state.isSortingCategories = !state.isSortingCategories;
      renderCategoryList();
      showToast(
        state.isSortingCategories
          ? '分类排序模式已开启（点击↑↓调整顺序，点击"改"按钮可修改分类名称）'
          : '已退出分类排序模式'
      );
    });
  }
}

function openAddCategoryModal() {
  const modal = document.getElementById('addCategoryModal');
  const input = document.getElementById('addCategoryInput');
  const btnClose = document.getElementById('btnCloseAddCategory');
  const btnCancel = document.getElementById('btnCancelAddCategory');
  const btnConfirm = document.getElementById('btnConfirmAddCategory');
  if (!modal || !input || !btnClose || !btnCancel || !btnConfirm) return;
  modal.classList.remove('hidden');
  input.value = '';
  input.focus();
  const close = () => { modal.classList.add('hidden'); };
  btnClose.onclick = close;
  btnCancel.onclick = close;
  btnConfirm.onclick = () => {
    const trimmed = input.value.trim();
    if (!trimmed) { showToast('分类名不能为空', 'error'); return; }
    if (state.categories.includes(trimmed)) { showToast('已存在同名分类', 'error'); return; }
    state.categories.push(trimmed);
    saveCategoriesToLocal();
    renderCategoryList();
    showToast('分类已新增');
    close();
  };
}

function openDeleteCategoryModal() {
  const modal = document.getElementById('deleteCategoryModal');
  const btnClose = document.getElementById('btnCloseDeleteCategory');
  const btnCancel = document.getElementById('btnCancelDeleteCategory');
  const btnConfirm = document.getElementById('btnConfirmDeleteCategory');
  if (!modal || !btnClose || !btnCancel || !btnConfirm) return;
  const cat = state.currentCategory;
  if (!cat || cat === '全部') { showToast('不能删除「全部」分类', 'error'); return; }
  modal.classList.remove('hidden');
  const nameEl = document.getElementById('deleteCategoryName');
  if (nameEl) nameEl.textContent = cat;
  const close = () => { modal.classList.add('hidden'); };
  btnClose.onclick = close;
  btnCancel.onclick = close;
  btnConfirm.onclick = () => {
    const target = state.currentCategory;
    state.categories = state.categories.filter((c) => c !== target);
    // 保留各条目的 main_category，不清空标签，方便后续重新新增分类时正确统计
    state.currentCategory = '全部';
    saveCategoriesToLocal();
    renderCategoryList();
    renderTitles();
    showToast('分类已删除');
    close();
  };
}

function bindCloudButtons() {
  const btnSave = document.getElementById('btnSaveCloud');
  const btnLoad = document.getElementById('btnLoadCloud');

  if (btnSave) btnSave.addEventListener('click', () => { hideCloudHistoryPanel(); openCloudLabelModal(); });
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

function openClearConfirmModal() {
  const modal = document.getElementById('clearConfirmModal');
  const btnClose = document.getElementById('btnCloseClearConfirm');
  const btnCancel = document.getElementById('btnCancelClear');
  const btnConfirm = document.getElementById('btnConfirmClear');
  if (!modal || !btnClose || !btnCancel || !btnConfirm) return;
  modal.classList.remove('hidden');
  const close = () => { modal.classList.add('hidden'); };
  btnClose.onclick = close;
  btnCancel.onclick = close;
  btnConfirm.onclick = async () => {
    if (!supabase) { showToast('Supabase 未配置，无法清空云端', 'error'); return; }
    try {
      const { error } = await supabase.from('titles').delete().not('id', 'is', null);
      if (error) throw error;
      state.titles = [];
      renderTitles();
      showToast('已清空全部标题');
    } catch (e) {
      showToast('清空失败： ' + (e.message || ''), 'error');
    } finally {
      close();
    }
  };
}

function openCloudLabelModal() {
  const modal = document.getElementById('cloudLabelModal');
  const input = document.getElementById('cloudLabelInput');
  const btnClose = document.getElementById('btnCloseCloudLabel');
  const btnCancel = document.getElementById('btnCancelCloudLabel');
  const btnSave = document.getElementById('btnSaveCloudLabel');
  if (!modal || !input || !btnClose || !btnCancel || !btnSave) return;
  modal.classList.remove('hidden');
  input.value = '';
  input.focus();
  const close = () => { modal.classList.add('hidden'); };
  btnClose.onclick = close;
  btnCancel.onclick = close;
  btnSave.onclick = async () => {
    if (!window.snapshotService) { alert('未配置 Supabase'); return; }
    const label = input.value.trim();
    try {
      const info = await window.snapshotService.saveUnifiedSnapshotFromCloud(label);
      close();
      showToast(`已保存：标题 ${info.titleCount} 条 文案 ${info.contentCount} 条 ${info.updatedText}`);
    } catch (e) {
      alert('保存快照失败：' + (e.message || 'Unknown error'));
    }
  };
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
