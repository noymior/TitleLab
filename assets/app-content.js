console.log('[ContentApp] app-content.js loaded');

const supabase = window.supabaseClient || null;

const DEFAULT_CATEGORIES = ['全部', '亲子', '情侣', '闺蜜', '单人', '烟花', '夜景'];
const CATEGORY_LS_KEY = 'content_categories_v1';
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

const state = {
  contents: [],
  categories: [...DEFAULT_CATEGORIES],
  currentCategory: '全部',
  renamingCategory: null, // 正在重命名的分类名称
  filters: { search: '', scene: '' },
  editingId: null,
  isSortingCategories: false
};

let toastTimer = null;

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
  applyDisplaySettings();
  loadCategoriesFromLocal();
  renderCategoryList();
  bindCategoryButtons();
  setupMobileCategoryDropdown();
  
  // 初始化场景下拉菜单
  refreshSceneSelects();
  
  bindToolbar();
  bindContentModal();
  bindImportModal();
  bindRenameCategoryModal();
  bindCloudButtons();
  bindGlobalNavButtons();
  
  // 监听 localStorage 变化，当场景设置改变时自动更新
  window.addEventListener('storage', (e) => {
    if (e.key === DISPLAY_SETTINGS_KEY) {
      refreshSceneSelects();
    }
  });
  
  // 也监听同窗口内的设置变化（通过自定义事件）
  window.addEventListener('settingsUpdated', () => {
    refreshSceneSelects();
  });
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
  loadContentsFromCloud();
});

let pendingSnapshotKeyContent = null;
function openCloudLoadConfirmContent(key) {
  const modal = document.getElementById('cloudLoadConfirmModalContent');
  const btnClose = document.getElementById('btnCloseCloudLoadConfirmContent');
  const btnCancel = document.getElementById('btnCancelCloudLoadContent');
  const btnConfirm = document.getElementById('btnConfirmCloudLoadContent');
  if (!modal || !btnClose || !btnCancel || !btnConfirm) return;
  pendingSnapshotKeyContent = key;
  modal.classList.remove('hidden');
  const close = () => { modal.classList.add('hidden'); pendingSnapshotKeyContent = null; };
  btnClose.onclick = close;
  btnCancel.onclick = close;
  btnConfirm.onclick = async () => {
    if (pendingSnapshotKeyContent) {
      try {
        const info = await window.snapshotService.loadUnifiedSnapshot(pendingSnapshotKeyContent, 'both');
        await loadContentsFromCloud();
        showToast(`已加载：标题 ${info.titleCount} 条 文案 ${info.contentCount} 条 ${info.updatedText}`);
      } catch (e) {
        alert('加载快照失败：' + (e.message || 'Unknown error'));
      }
    }
    close();
  };
}

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

function stripLeadingIndex(s) {
  return (s || '').replace(/^\s*\d+(?:\.\d+)*(?:[\.)、．])?\s*/, '');
}

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
  } catch (_) {
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
  if (topbarTitle) topbarTitle.style.color = settings.titleColor;
  renderSceneFilterOptions(settings);
  // 同时刷新所有场景下拉菜单
  refreshSceneSelects();
}

function loadCategoriesFromLocal() {
  const raw = localStorage.getItem(CATEGORY_LS_KEY);
  if (!raw) { state.categories = [...DEFAULT_CATEGORIES]; return; }
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) {
      state.categories = [...DEFAULT_CATEGORIES];
    } else {
      const set = new Set(arr);
      set.delete('全部');
      state.categories = ['全部', ...set];
    }
  } catch (_) {
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
    li.className = 'category-item' + (cat === state.currentCategory ? ' active' : '');
    li.dataset.cat = cat;
    // 左侧：分类名（排序模式下可编辑）
    const nameSpan = document.createElement('span');
    nameSpan.className = 'category-name';
    
    nameSpan.textContent = cat;
    const rightSpan = document.createElement('span');
    rightSpan.className = 'category-right';
    const count = cat === '全部'
      ? state.contents.length
      : state.contents.filter((t) => t.main_category === cat).length;
    const countSpan = document.createElement('span');
    countSpan.className = 'category-count';
    countSpan.textContent = `${count}条`;
    rightSpan.appendChild(countSpan);

    if (state.isSortingCategories && cat !== '全部') {
      const controls = document.createElement('span');
      controls.className = 'category-sort-controls';
      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.innerHTML = '▲';
      btnUp.className = 'function-btn ghost text-xs btn-inline';
      btnUp.style.marginLeft = '4px';
      btnUp.addEventListener('click', (e) => { e.stopPropagation(); reorderCategory(index, -1); });
      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.innerHTML = '▼';
      btnDown.className = 'function-btn ghost text-xs btn-inline';
      btnDown.style.marginLeft = '4px';
      btnDown.addEventListener('click', (e) => { e.stopPropagation(); reorderCategory(index, 1); });
      
      const btnRename = document.createElement('button');
      btnRename.type = 'button';
      btnRename.textContent = '改';
      btnRename.className = 'function-btn ghost text-xs btn-inline';
      btnRename.style.marginLeft = '4px';
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('[ContentApp] 点击改按钮，分类名称：', cat);
        openRenameCategoryModal(cat);
      });
      
      controls.appendChild(btnUp);
      controls.appendChild(btnDown);
      controls.appendChild(btnRename);
      rightSpan.appendChild(controls);
    }
    li.addEventListener('click', (e) => {
      // 如果点击的是按钮，不处理
      if (e.target.closest('button')) return;
      // 排序模式下不切换分类
      if (state.isSortingCategories) return;
      
      state.currentCategory = cat;
      renderCategoryList();
      renderContents();
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

function reorderCategory(index, delta) {
  const newIndex = index + delta;
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
        .from('contents')
        .update({ main_category: newName })
        .eq('main_category', oldName);
      
      if (error) throw error;
      
      // 更新本地 state.contents
      state.contents.forEach((content) => {
        if (content.main_category === oldName) {
          content.main_category = newName;
        }
      });
      
      showToast('分类名称已更新');
    } catch (e) {
      console.error('[ContentApp] 更新分类名称失败', e);
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
  renderContents();
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

function bindToolbar() {
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const filterScene = document.getElementById('filterScene');
  const btnNew = document.getElementById('btnNewTitle');
  const btnBatchImport = document.getElementById('btnBatchImport');
  const btnClearAll = document.getElementById('btnClearAll');
  if (searchInput) {
    const syncClearBtn = () => {
      if (!btnClearSearch) return;
      btnClearSearch.style.display = searchInput.value ? 'inline-flex' : 'none';
    };
    searchInput.addEventListener('input', (e) => {
      state.filters.search = e.target.value.trim();
      renderContents();
      syncClearBtn();
    });
    syncClearBtn();
    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        state.filters.search = '';
        renderContents();
        syncClearBtn();
      });
    }
  }
  if (btnBatchImport) {
    btnBatchImport.addEventListener('click', () => {
      openImportModal();
    });
  }
  if (filterScene) {
    filterScene.addEventListener('change', (e) => {
      state.filters.scene = e.target.value;
      renderContents();
    });
  }
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      openContentModal();
    });
  }
  if (btnClearAll) {
    btnClearAll.addEventListener('click', openClearConfirmModal);
  }
}

async function loadContentsFromCloud() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('contents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const user = getCurrentUser();
    const tag = user ? userTag(user.username) : null;
    const filtered = tag
      ? (data || []).filter((it) => Array.isArray(it.scene_tags) && it.scene_tags.includes(tag))
      : (data || []);
    state.contents = filtered;
    renderCategoryList();
    renderContents();
  } catch (e) {
    state.contents = [];
    renderCategoryList();
    renderContents();
  }
}

function userTag(u) { return `user:${u}`; }

function applyFilters(list) {
  const cat = state.currentCategory;
  const scene = state.filters.scene;
  const q = state.filters.search.toLowerCase();
  const filtered = list.filter((item) => {
    // 主分类筛选
    if (cat !== '全部' && item.main_category !== cat) return false;
    
    // 账号分类筛选（通过 scene_tags）
    if (scene) {
      const tags = Array.isArray(item.scene_tags) ? item.scene_tags : [];
      if (!tags.includes(scene)) return false;
    }
    
    // 搜索筛选
    if (q && !(item.text || '').toLowerCase().includes(q)) return false;
    
    return true;
  });
  console.log('[ContentApp] 筛选结果:', {
    total: list.length,
    filtered: filtered.length,
    filters: { category: cat, scene: scene, search: q }
  });
  return filtered;
}

function renderContents() {
  const tbody = document.getElementById('contentTableBody');
  const mobileList = document.getElementById('contentMobileList');
  if (!tbody || !mobileList) return;
  tbody.innerHTML = '';
  mobileList.innerHTML = '';
  const list = applyFilters(state.contents);
  list.forEach((item, index) => {
    const tr = document.createElement('tr');
    const tdIndex = document.createElement('td');
    tdIndex.textContent = index + 1;
    tr.appendChild(tdIndex);
    const tdTitle = document.createElement('td');
    tdTitle.textContent = item.text || '';
    tr.appendChild(tdTitle);
    const tdCat = document.createElement('td');
    tdCat.textContent = item.main_category || '';
    tr.appendChild(tdCat);
    const tdActions = document.createElement('td');
    const btnEdit = document.createElement('button');
    btnEdit.className = 'function-btn ghost text-xs btn-inline btn-rect';
    btnEdit.textContent = '修改';
    btnEdit.addEventListener('click', () => openContentModal(item));
    const btnDel = document.createElement('button');
    btnDel.className = 'function-btn ghost text-xs btn-inline btn-rect';
    btnDel.textContent = '删除';
    btnDel.addEventListener('click', () => openDeleteContentModal(item));
    const btnCopy = document.createElement('button');
    btnCopy.className = 'function-btn text-xs btn-inline btn-rect';
    btnCopy.textContent = '复制';
    btnCopy.addEventListener('click', () => copyContent(item));
    const group = document.createElement('div');
    group.className = 'action-group';
    group.append(btnCopy, btnEdit, btnDel);
    tdActions.appendChild(group);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
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
    actions.className = 'flex gap-2 flex-shrink-0 mobile-actions';
    const mCopy = document.createElement('button');
    mCopy.className = 'function-btn text-xs btn-inline';
    mCopy.textContent = '复制';
    mCopy.addEventListener('click', () => copyContent(item));
    const mEdit = document.createElement('button');
    mEdit.className = 'function-btn ghost text-xs btn-inline';
    mEdit.textContent = '修改';
    mEdit.addEventListener('click', () => openContentModal(item));
    const mDel = document.createElement('button');
    mDel.className = 'function-btn ghost text-xs btn-inline';
    mDel.textContent = '删除';
    mDel.addEventListener('click', () => openDeleteContentModal(item));
    actions.append(mCopy, mEdit, mDel);
    headerRow.append(leftWrap, actions);
    const details = document.createElement('div');
    details.className = 'mobile-card-details hidden';
    details.textContent = item.text || '';
    headerRow.addEventListener('click', (e) => {
      if (e.target && e.target.closest('button')) return;
      details.classList.toggle('hidden');
      card.classList.toggle('open');
    });
    card.append(headerRow, details, actions);
    mobileList.appendChild(card);
  });
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-xs text-gray-500 py-2';
    empty.textContent = '暂无文案，请先新增。';
    mobileList.appendChild(empty);
  }
}

async function copyContent(item) {
  try {
    await navigator.clipboard.writeText(item.text || '');
    showToast('已复制');
  } catch (_) {
    showToast('复制失败', 'error');
  }
  if (!supabase || !item.id) return;
  try {
    const newCount = (item.usage_count || 0) + 1;
    await supabase.from('contents').update({ usage_count: newCount }).eq('id', item.id);
    const idx = state.contents.findIndex((t) => t.id === item.id);
    if (idx !== -1) state.contents[idx] = { ...state.contents[idx], usage_count: newCount };
  } catch (_) {}
}

function setupMobileCategoryDropdown() {
  const wrapper = document.getElementById('mobileCategoryWrapper');
  const toggleBtn = document.getElementById('mobileCategoryToggle');
  const list = document.getElementById('categoryList');
  if (!wrapper || !toggleBtn || !list) return;
  function isMobile() { return window.innerWidth < 768; }
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

function bindCategoryButtons() {
  const btnAdd = document.getElementById('btnAddCategory');
  const btnDel = document.getElementById('btnDeleteCategory');
  const btnSort = document.getElementById('btnSortCategory');
  if (btnAdd) {
    btnAdd.addEventListener('click', openAddCategoryModalContent);
  }
  if (btnDel) {
    btnDel.addEventListener('click', openDeleteCategoryModalContent);
  }
  if (btnSort) {
    btnSort.addEventListener('click', () => {
      state.isSortingCategories = !state.isSortingCategories;
      renderCategoryList();
      showToast(state.isSortingCategories ? '分类排序模式已开启（点击↑↓调整顺序，点击"改"按钮可修改分类名称）' : '已退出分类排序模式');
    });
  }
}

function openAddCategoryModalContent() {
  const modal = document.getElementById('addCategoryModalContent');
  const input = document.getElementById('addCategoryInputContent');
  const btnClose = document.getElementById('btnCloseAddCategoryContent');
  const btnCancel = document.getElementById('btnCancelAddCategoryContent');
  const btnConfirm = document.getElementById('btnConfirmAddCategoryContent');
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

function openDeleteCategoryModalContent() {
  const modal = document.getElementById('deleteCategoryModalContent');
  const btnClose = document.getElementById('btnCloseDeleteCategoryContent');
  const btnCancel = document.getElementById('btnCancelDeleteCategoryContent');
  const btnConfirm = document.getElementById('btnConfirmDeleteCategoryContent');
  if (!modal || !btnClose || !btnCancel || !btnConfirm) return;
  const cat = state.currentCategory;
  if (!cat || cat === '全部') { showToast('不能删除「全部」分类', 'error'); return; }
  modal.classList.remove('hidden');
  const nameEl = document.getElementById('deleteCategoryNameContent');
  if (nameEl) nameEl.textContent = cat;
  const close = () => { modal.classList.add('hidden'); };
  btnClose.onclick = close;
  btnCancel.onclick = close;
  btnConfirm.onclick = () => {
    const target = state.currentCategory;
    state.categories = state.categories.filter((c) => c !== target);
    // 不清空条目的 main_category 标签，便于后续重新新增分类时正确统计
    state.currentCategory = '全部';
    saveCategoriesToLocal();
    renderCategoryList();
    renderContents();
    showToast('分类已删除');
    close();
  };
}

function bindContentModal() {
  const btnClose = document.getElementById('btnCloseModalContent');
  const btnCancel = document.getElementById('btnCancelModalContent');
  const btnSave = document.getElementById('btnSaveContent');
  if (btnClose) btnClose.addEventListener('click', closeContentModal);
  if (btnCancel) btnCancel.addEventListener('click', closeContentModal);
  if (btnSave) btnSave.addEventListener('click', saveContentFromModal);
}

function openContentModal(item) {
  const modal = document.getElementById('contentModal');
  if (!modal) return;
  const titleEl = document.getElementById('contentModalTitle');
  const textEl = document.getElementById('fieldTextContent');
  const mainCatEl = document.getElementById('fieldMainCategoryContent');
  const typeEl = document.getElementById('fieldContentTypeContent');
  const sceneEl = document.getElementById('fieldSceneTagsContent');
  refreshModalCategoryOptions(mainCatEl);
  // 刷新场景下拉菜单
  refreshSceneSelects();
  if (item && item.id) {
    state.editingId = item.id;
    if (titleEl) titleEl.textContent = '修改文案';
    if (textEl) textEl.value = item.text || '';
    if (mainCatEl) mainCatEl.value = item.main_category || '';
    
    // 从 scene_tags 中提取账号分类（场景管理中的值）
    const settings = getDisplaySettings();
    const scenes = settings.scenes || [];
    const sceneTags = Array.isArray(item.scene_tags) ? item.scene_tags : [];
    const accountCategory = sceneTags.find(tag => scenes.includes(tag));
    if (typeEl) typeEl.value = accountCategory || item.content_type || '';
    
    // 场景标签（排除账号分类和用户标签）
    const user = getCurrentUser();
    const userTagValue = user ? userTag(user.username) : '';
    const sceneTagsOnly = sceneTags.filter(tag => 
      !scenes.includes(tag) && tag !== userTagValue
    );
    if (sceneEl) sceneEl.value = sceneTagsOnly.join(', ');
  } else {
    state.editingId = null;
    if (titleEl) titleEl.textContent = '新增文案';
    if (textEl) textEl.value = '';
    if (mainCatEl) mainCatEl.value = state.currentCategory === '全部' ? '' : state.currentCategory;
    if (typeEl) typeEl.value = '';
    if (sceneEl) sceneEl.value = '';
  }
  modal.classList.remove('hidden');
}

function closeContentModal() {
  const modal = document.getElementById('contentModal');
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

async function saveContentFromModal() {
  const fieldText = document.getElementById('fieldTextContent');
  const fieldCat = document.getElementById('fieldMainCategoryContent');
  const fieldType = document.getElementById('fieldContentTypeContent');
  const fieldScene = document.getElementById('fieldSceneTagsContent');
  if (!fieldText || !fieldCat || !fieldType || !fieldScene) return;
  const text = fieldText.value.trim();
  const cat = fieldCat.value || null;
  const type = fieldType.value || null;
  const sceneRaw = fieldScene.value.trim();
  if (!text) { showToast('文案不能为空', 'error'); return; }
  const sceneTags = sceneRaw ? sceneRaw.split(/[，,、]/).map((s) => s.trim()).filter(Boolean) : [];
  const user = getCurrentUser(); if (!user) { showToast('请先登录', 'error'); return; }
  
  // 账号分类（fieldContentTypeContent）应该添加到 scene_tags 中
  const allSceneTags = [...(sceneTags || [])];
  if (type) {
    allSceneTags.push(type);
  }
  allSceneTags.push(userTag(user.username));
  
  const payload = { text, main_category: cat, content_type: type, scene_tags: Array.from(new Set(allSceneTags)) };
  console.log('[ContentApp] 保存文案 payload =', payload, 'editingId =', state.editingId);
  if (!supabase) { showToast('未配置 Supabase，无法保存到云端', 'error'); return; }
  const prevCategory = state.currentCategory;
  try {
    if (state.editingId) {
      const { error } = await supabase.from('contents').update(payload).eq('id', state.editingId);
      if (error) throw error;
      const idx = state.contents.findIndex((t) => t.id === state.editingId);
      if (idx !== -1) state.contents[idx] = { ...state.contents[idx], ...payload };
      showToast('文案已更新');
  } else {
      const insertPayload = { ...payload, usage_count: 0 };
      const { data, error } = await supabase.from('contents').insert([insertPayload]).select().single();
      if (error) throw error;
      if (data) state.contents.unshift(data);
      showToast('文案已新增');
    }
    state.currentCategory = prevCategory;
    renderCategoryList();
    renderContents();
    closeContentModal();
  } catch (e) {
    showToast('保存失败：' + (e.message || ''), 'error');
  }
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
  if ((settings.scenes || []).includes(prevValue)) filterScene.value = prevValue; else filterScene.value = ''; 
  state.filters.scene = filterScene.value || '';
}

// 刷新场景下拉菜单（从场景管理设置获取）
function refreshSceneSelects() {
  const settings = getDisplaySettings();
  const scenes = settings.scenes || [];
  
  // 更新 filterScene（场景筛选）
  const filterScene = document.getElementById('filterScene');
  if (filterScene) {
    const prevValue = filterScene.value;
    filterScene.innerHTML = '<option value="">账号分类</option>';
    scenes.forEach((scene) => {
      const opt = document.createElement('option');
      opt.value = scene;
      opt.textContent = scene;
      filterScene.appendChild(opt);
    });
    // 如果之前选中的值仍然存在，保持选中
    if (scenes.includes(prevValue)) {
      filterScene.value = prevValue;
    } else {
      filterScene.value = '';
      state.filters.scene = '';
    }
  }
  
  // 更新 fieldContentTypeContent（新增文案模态框中的账号分类）
  const fieldContentTypeContent = document.getElementById('fieldContentTypeContent');
  if (fieldContentTypeContent) {
    const prevValue = fieldContentTypeContent.value;
    fieldContentTypeContent.innerHTML = '<option value="">账号分类</option>';
    scenes.forEach((scene) => {
      const opt = document.createElement('option');
      opt.value = scene;
      opt.textContent = scene;
      fieldContentTypeContent.appendChild(opt);
    });
    // 如果之前选中的值仍然存在，保持选中
    if (scenes.includes(prevValue)) {
      fieldContentTypeContent.value = prevValue;
    } else {
      fieldContentTypeContent.value = '';
    }
  }
  
  // 更新 importAccountCategorySelectContent（批量导入模态框中的账号分类）
  const importAccountCategorySelectContent = document.getElementById('importAccountCategorySelectContent');
  if (importAccountCategorySelectContent) {
    const prevValue = importAccountCategorySelectContent.value;
    importAccountCategorySelectContent.innerHTML = '<option value="">账号分类</option>';
    scenes.forEach((scene) => {
      const opt = document.createElement('option');
      opt.value = scene;
      opt.textContent = scene;
      importAccountCategorySelectContent.appendChild(opt);
    });
    // 如果之前选中的值仍然存在，保持选中
    if (scenes.includes(prevValue)) {
      importAccountCategorySelectContent.value = prevValue;
    } else {
      importAccountCategorySelectContent.value = '';
    }
  }
}

function bindImportModal() {
  const btnClose = document.getElementById('btnCloseImportContent');
  const btnCancel = document.getElementById('btnCancelImportContent');
  const btnRun = document.getElementById('btnRunImportContent');
  if (btnClose) btnClose.addEventListener('click', closeImportModal);
  if (btnCancel) btnCancel.addEventListener('click', closeImportModal);
  if (btnRun) btnRun.addEventListener('click', runImport);
}

function openImportModal() {
  const modal = document.getElementById('importModalContent');
  if (!modal) return;
  const rawInput = document.getElementById('importRawInputContent');
  if (rawInput) rawInput.value = '';
  const sel = document.getElementById('importCategorySelectContent');
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
  
  // 刷新账号分类下拉菜单
  refreshSceneSelects();
  
  modal.classList.remove('hidden');
}

function closeImportModal() {
  const modal = document.getElementById('importModalContent');
  if (!modal) return;
  modal.classList.add('hidden');
}

async function runImport() {
  const rawInput = document.getElementById('importRawInputContent');
  if (!rawInput) return;
  const raw = rawInput.value || '';
  const lines = raw.split('\n').map((s) => stripLeadingIndex(s).trim()).filter(Boolean);
  if (!lines.length) { showToast('没有可导入的内容', 'error'); return; }
  if (!supabase) { showToast('未配置 Supabase，无法导入云端', 'error'); return; }
  const importCategorySelectContent = document.getElementById('importCategorySelectContent');
  const importAccountCategorySelectContent = document.getElementById('importAccountCategorySelectContent');
  const mainCategory = importCategorySelectContent && importCategorySelectContent.value ? importCategorySelectContent.value : null;
  const accountCategory = importAccountCategorySelectContent && importAccountCategorySelectContent.value ? importAccountCategorySelectContent.value : null;
  
  const rows = lines.map((text) => {
    const sceneTags = [userTag(getCurrentUser().username)];
    if (accountCategory) {
      sceneTags.push(accountCategory);
    }
    return {
      text,
      main_category: mainCategory,
      content_type: accountCategory,
      scene_tags: Array.from(new Set(sceneTags)),
      usage_count: 0
    };
  });
  console.log('[ContentApp] 批量导入 rows =', rows, 'mainCategory =', mainCategory, 'accountCategory =', accountCategory);
  try {
    const { error } = await supabase.from('contents').insert(rows);
    if (error) throw error;
    showToast(`批量导入成功，共 ${rows.length} 条`);
    closeImportModal();
    await loadContentsFromCloud();
  } catch (e) {
    showToast('云端导入失败', 'error');
  }
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
  if (btnSettings) btnSettings.addEventListener('click', () => { window.location.href = 'settings.html'; });
  if (btnManage) btnManage.addEventListener('click', () => { window.location.href = 'admin-center.html'; });
}

async function renderCloudHistoryList(anchorBtn) {
  if (!window.snapshotService) { alert('未配置 Supabase'); return; }
  const panel = document.getElementById('cloudHistoryPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.style.display = 'block';
  panel.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:#6b7280;">加载中…</div>';
  const rect = anchorBtn.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  let left = rect.left + scrollLeft;
  const top = rect.bottom + scrollTop + 8;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
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
      panel.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:#6b7280;">暂无快照</div>';
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
        openCloudLoadConfirmContent(key);
        panel.classList.add('hidden');
        panel.style.display = 'none';
      });
    });
  } catch (e) {
    panel.innerHTML = '<div style="padding:8px 10px;color:#f43f5e;">加载云端快照失败</div>';
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

window.openContentModal = openContentModal;
window.openImportModal = openImportModal;
window.bindContentModal = bindContentModal;
window.bindImportModal = bindImportModal;

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
      const { error } = await supabase.from('contents').delete().not('id', 'is', null);
      if (error) throw error;
      state.contents = [];
      renderContents();
      showToast('已清空全部文案');
    } catch (e) {
      showToast('清空失败：' + (e.message || ''), 'error');
    } finally {
      close();
    }
  };
}

async function deleteContent(item) {
  state.contents = state.contents.filter((t) => t.id !== item.id);
  renderContents();
  if (!supabase || !item.id) return;
  try {
    await supabase.from('contents').delete().eq('id', item.id);
    showToast('已删除');
  } catch (_) {
    showToast('删除失败（云端）', 'error');
  }
}

let pendingDeleteContent = null;
function openDeleteContentModal(item) {
  const modal = document.getElementById('deleteContentModal');
  const btnClose = document.getElementById('btnCloseDeleteContent');
  const btnCancel = document.getElementById('btnCancelDeleteContent');
  const btnConfirm = document.getElementById('btnConfirmDeleteContent');
  const previewEl = document.getElementById('deleteContentPreview');
  if (!modal || !btnClose || !btnCancel || !btnConfirm) return;
  pendingDeleteContent = item;
  if (previewEl) previewEl.textContent = (item.text || '').slice(0, 80);
  modal.classList.remove('hidden');
  const close = () => { modal.classList.add('hidden'); pendingDeleteContent = null; };
  btnClose.onclick = close;
  btnCancel.onclick = close;
  btnConfirm.onclick = () => {
    if (pendingDeleteContent) deleteContent(pendingDeleteContent);
    close();
  };
}

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.background = type === 'error' ? 'rgba(220,38,38,0.92)' : 'rgba(17,24,39,0.92)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add('hidden'); }, 1800);
}