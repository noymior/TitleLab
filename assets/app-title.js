// assets/app-title.js

// 全局状态
let state = {
  categories: ['全部', '亲子', '情侣', '闺蜜', '单人', '家庭', '街拍', '烟花', '夜景'],
  currentCategory: '全部',
  titles: [],
  filters: {
    search: '',
    contentType: '',
    scene: '',
  },
  editingId: null,
};

let toastTimer = null;

// 入口
document.addEventListener('DOMContentLoaded', () => {
  initCategoryList();
  bindToolbarEvents();
  bindCategoryButton();
  bindModalEvents();
  bindImportEvents();
  loadTitles();
});

/* ========== 分类列表 ========== */

function initCategoryList() {
  const list = document.getElementById('categoryList');
  if (!list) {
    console.error('找不到 #categoryList 元素');
    return;
  }
  list.innerHTML = '';

  state.categories.forEach((name) => {
    const li = document.createElement('li');
    li.className =
      'category-item' + (name === state.currentCategory ? ' active' : '');
    li.textContent = name;
    li.dataset.cat = name;
    li.addEventListener('click', () => {
      state.currentCategory = name;
      document
        .querySelectorAll('.category-item')
        .forEach((el) => el.classList.remove('active'));
      li.classList.add('active');
      renderTitles();
    });
    list.appendChild(li);
  });
}

/* ========== 新增分类按钮 ========== */

function bindCategoryButton() {
  const btnAddCategory = document.getElementById('btnAddCategory');
  if (!btnAddCategory) {
    console.error('找不到 #btnAddCategory');
    return;
  }

  btnAddCategory.addEventListener('click', () => {
    const name = prompt('请输入新分类名称（例如：夜樱 / 亲子旅拍）：');
    if (!name) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    if (trimmed === '全部') {
      showToast('不能使用“全部”作为分类名');
      return;
    }

    if (state.categories.includes(trimmed)) {
      showToast('该分类已存在');
      return;
    }

    // “全部”永远在第一位，新分类插在后面
    state.categories.push(trimmed);
    initCategoryList();
    showToast('已新增分类：' + trimmed);
  });
}

/* ========== 工具栏事件 ========== */

function bindToolbarEvents() {
  const searchInput = document.getElementById('searchInput');
  const filterContentType = document.getElementById('filterContentType');
  const filterScene = document.getElementById('filterScene');
  const btnNewTitle = document.getElementById('btnNewTitle');
  const btnBatchImport = document.getElementById('btnBatchImport');

  if (!searchInput || !filterContentType || !filterScene || !btnNewTitle || !btnBatchImport) {
    console.error('工具栏元素缺失，请检查 title.html 中相关 id。');
    return;
  }

  let timer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.filters.search = e.target.value.trim();
      renderTitles();
    }, 250);
  });

  filterContentType.addEventListener('change', (e) => {
    state.filters.contentType = e.target.value;
    renderTitles();
  });

  filterScene.addEventListener('change', (e) => {
    state.filters.scene = e.target.value;
    renderTitles();
  });

  btnNewTitle.addEventListener('click', () => {
    openTitleModal();
  });

  btnBatchImport.addEventListener('click', openImportModal);
}

/* ========== 加载 Supabase 数据 ========== */

async function loadTitles() {
  try {
    const { data, error } = await supabaseClient
      .from('titles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('加载 titles 失败:', error);
      showToast('加载标题失败：' + (error.message || '请查看控制台'));
      return;
    }

    state.titles = data || [];
    renderTitles();
  } catch (err) {
    console.error('loadTitles 异常:', err);
    showToast('加载标题异常（详见控制台）');
  }
}

/* ========== 渲染逻辑 ========== */

function applyFilters(items) {
  return items.filter((item) => {
    const {
      currentCategory,
      filters: { search, contentType, scene },
    } = state;

    if (currentCategory !== '全部' && item.main_category !== currentCategory) {
      return false;
    }

    if (contentType && item.content_type !== contentType) {
      return false;
    }

    if (scene) {
      const tags = item.scene_tags || [];
      if (!Array.isArray(tags) || !tags.includes(scene)) return false;
    }

    if (search) {
      const lc = search.toLowerCase();
      const text = (item.text || '').toLowerCase();
      const kw = JSON.stringify(item.keywords || []).toLowerCase();
      if (!text.includes(lc) && !kw.includes(lc)) return false;
    }

    return true;
  });
}

function renderTitles() {
  const tbody = document.getElementById('titleTableBody');
  const mobileList = document.getElementById('mobileList');

  if (!tbody || !mobileList) {
    console.error('找不到 #titleTableBody 或 #mobileList 元素');
    return;
  }

  tbody.innerHTML = '';
  mobileList.innerHTML = '';

  const items = applyFilters(state.titles);

  items.forEach((item, idx) => {
    /* 桌面表格行 */
    const tr = document.createElement('tr');

    const tdIndex = document.createElement('td');
    tdIndex.textContent = idx + 1;
    tr.appendChild(tdIndex);

    const tdText = document.createElement('td');
    tdText.textContent = item.text;
    tr.appendChild(tdText);

    const tdMain = document.createElement('td');
    tdMain.textContent = item.main_category || '';
    tr.appendChild(tdMain);

    const tdScene = document.createElement('td');
    tdScene.textContent = Array.isArray(item.scene_tags)
      ? item.scene_tags.join(', ')
      : '';
    tr.appendChild(tdScene);

    const tdType = document.createElement('td');
    tdType.textContent = item.content_type || '';
    tr.appendChild(tdType);

    const tdUsage = document.createElement('td');
    tdUsage.textContent = item.usage_count || 0;
    tr.appendChild(tdUsage);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions-cell';

    // ⭐ 用一个容器包起来，强制一排显示
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'action-group';

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

    actionsWrap.append(btnCopy, btnEdit, btnDel);
    tdActions.appendChild(actionsWrap);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);

    /* 移动端卡片 */
    const card = document.createElement('div');
    card.className = 'panel mobile-card';

    const t = document.createElement('div');
    t.className = 'text-sm font-medium mb-1';
    t.textContent = item.text;
    card.appendChild(t);

    const meta = document.createElement('div');
    meta.className = 'text-xs text-gray-500 flex flex-wrap gap-2';
    meta.innerHTML = `
      <span>[${item.main_category || '未分类'}]</span>
      <span>${Array.isArray(item.scene_tags) ? item.scene_tags.join(', ') : ''}</span>
      <span>${item.content_type || ''}</span>
      <span>使用 ${item.usage_count || 0}</span>
    `;
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'mt-2 flex gap-2';

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
    card.appendChild(actions);

    mobileList.appendChild(card);
  });
}

/* ========== 复制标题 ========== */

async function copyTitle(item) {
  try {
    await navigator.clipboard.writeText(item.text || '');
    showToast('标题已复制');

    const { error } = await supabaseClient
      .from('titles')
      .update({ usage_count: (item.usage_count || 0) + 1 })
      .eq('id', item.id);

    if (error) {
      console.error('更新 usage_count 失败:', error);
    }

    await loadTitles();
  } catch (e) {
    console.error('复制失败:', e);
    showToast('复制失败');
  }
}

/* ========== 删除标题 ========== */

async function deleteTitle(item) {
  if (!confirm('确认删除这条标题？')) return;

  const { error } = await supabaseClient.from('titles').delete().eq('id', item.id);
  if (error) {
    console.error('删除失败:', error);
    showToast('删除失败：' + (error.message || '请查看控制台'));
    return;
  }
  showToast('已删除');
  state.titles = state.titles.filter((x) => x.id !== item.id);
  renderTitles();
}

/* ========== 新增 / 编辑弹窗 ========== */

function bindModalEvents() {
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const btnSaveTitle = document.getElementById('btnSaveTitle');

  if (!btnCloseModal || !btnCancelModal || !btnSaveTitle) {
    console.error('标题弹窗按钮未找到，请检查 id。');
    return;
  }

  btnCloseModal.addEventListener('click', closeTitleModal);
  btnCancelModal.addEventListener('click', closeTitleModal);
  btnSaveTitle.addEventListener('click', saveTitleFromModal);
}

function openTitleModal(item) {
  const modal = document.getElementById('titleModal');
  const title = document.getElementById('titleModalTitle');
  const fieldText = document.getElementById('fieldText');
  const fieldCat = document.getElementById('fieldMainCategory');
  const fieldType = document.getElementById('fieldContentType');
  const fieldScene = document.getElementById('fieldSceneTags');

  if (!modal || !title || !fieldText || !fieldCat || !fieldType || !fieldScene) {
    console.error('标题弹窗相关元素缺失，请检查 id。');
    return;
  }

  // 填充分类下拉
  fieldCat.innerHTML = '';
  state.categories
    .filter((c) => c !== '全部')
    .forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      fieldCat.appendChild(opt);
    });

  if (item) {
    state.editingId = item.id;
    title.textContent = '修改标题';
    fieldText.value = item.text || '';
    fieldCat.value = item.main_category || '';
    fieldType.value = item.content_type || '';
    fieldScene.value = Array.isArray(item.scene_tags)
      ? item.scene_tags.join(', ')
      : '';
  } else {
    state.editingId = null;
    title.textContent = '新增标题';
    fieldText.value = '';
    fieldCat.value =
      state.currentCategory !== '全部' ? state.currentCategory : '';
    fieldType.value = '';
    fieldScene.value = '';
  }

  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  if (window.gsap) {
    const box = modal.querySelector('.modal');
    if (box) {
      gsap.fromTo(
        box,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.2 }
      );
    }
  }
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

  if (!fieldText || !fieldCat || !fieldType || !fieldScene) {
    showToast('保存失败：表单元素缺失');
    return;
  }

  const text = fieldText.value.trim();
  const mainCategory = fieldCat.value || null;
  const contentType = fieldType.value || null;
  const sceneRaw = fieldScene.value.trim();

  if (!text) {
    showToast('标题不能为空');
    return;
  }

  const auto = classifyTitleText(text);
  const sceneTags =
    sceneRaw.length > 0
      ? sceneRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : auto.scene_tags || [];

  const payload = {
    text,
    main_category: mainCategory || auto.main_category,
    content_type: contentType || auto.content_type,
    scene_tags: sceneTags,
    keywords: [],
  };

  try {
    let error;
    if (state.editingId) {
      const res = await supabaseClient
        .from('titles')
        .update(payload)
        .eq('id', state.editingId)
        .select('*')
        .single();
      error = res.error;
    } else {
      const res = await supabaseClient.from('titles').insert(payload);
      error = res.error;
    }

    if (error) {
      console.error('保存标题失败:', error);
      showToast('保存失败：' + (error.message || '请查看控制台'));
      return;
    }

    showToast('已保存');
    closeTitleModal();
    await loadTitles();
  } catch (err) {
    console.error('saveTitleFromModal 异常:', err);
    showToast('保存异常（详见控制台）');
  }
}

/* ========== 批量导入相关 ========== */

function bindImportEvents() {
  const btnCloseImport = document.getElementById('btnCloseImport');
  const btnCancelImport = document.getElementById('btnCancelImport');
  const btnRunImport = document.getElementById('btnRunImport');

  if (!btnCloseImport || !btnCancelImport || !btnRunImport) {
    console.error('导入弹窗按钮未找到，请检查 id 是否一致');
    return;
  }

  btnCloseImport.addEventListener('click', closeImportModal);
  btnCancelImport.addEventListener('click', closeImportModal);
  btnRunImport.addEventListener('click', runImport);
}

function openImportModal() {
  const modal = document.getElementById('importModal');
  const rawInput = document.getElementById('importRawInput');
  const preview = document.getElementById('importPreview');

  if (!modal) {
    console.error('找不到 #importModal 元素');
    return;
  }

  if (rawInput) rawInput.value = '';
  if (preview) preview.innerHTML = '';

  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  if (window.gsap) {
    const box = modal.querySelector('.modal');
    if (box) {
      gsap.fromTo(
        box,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.2 }
      );
    }
  }
}

function closeImportModal() {
  const modal = document.getElementById('importModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
}

function buildImportPreview(lines) {
  const container = document.getElementById('importPreview');
  if (!container) {
    console.error('找不到 #importPreview 元素');
    return;
  }

  container.innerHTML = '';

  lines.forEach((line, idx) => {
    const auto = classifyTitleText(line);
    const row = document.createElement('div');
    row.className = 'import-row';
    row.innerHTML = `
      <div class="truncate">${idx + 1}. ${line}</div>
      <div class="text-gray-500 text-xs">
        ${auto.main_category || '主分类: 未识别'}
      </div>
      <div class="text-gray-500 text-xs">
        ${auto.content_type || '类型: 未识别'}
      </div>
    `;
    container.appendChild(row);
  });
}

async function runImport() {
  try {
    const rawEl = document.getElementById('importRawInput');
    if (!rawEl) {
      showToast('导入失败：找不到输入框');
      console.error('未找到 #importRawInput 元素');
      return;
    }

    const raw = rawEl.value.trim();
    if (!raw) {
      showToast('请先粘贴标题');
      return;
    }

    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      showToast('没有有效行');
      return;
    }

    // 预览识别结果
    buildImportPreview(lines);

    if (!confirm(`共 ${lines.length} 条标题，确认导入 Supabase 吗？`)) {
      return;
    }

    const payloads = lines.map((text) => {
      const auto = classifyTitleText(text);
      return {
        text,
        main_category: auto.main_category || null,
        content_type: auto.content_type || null,
        scene_tags: auto.scene_tags || [],
        keywords: [],
      };
    });

    console.log('即将插入 payloads:', payloads);

    const { data, error } = await supabaseClient
      .from('titles')
      .insert(payloads)
      .select('*');

    if (error) {
      console.error('Supabase insert error:', error);
      showToast('导入失败：' + (error.message || '请打开控制台查看详情'));
      return;
    }

    console.log('插入成功 rows:', data);
    showToast('导入完成');
    closeImportModal();
    await loadTitles();
  } catch (err) {
    console.error('runImport 运行时异常:', err);
    showToast('导入失败：前端异常（详见控制台）');
  }
}

/* ========== Toast ========== */

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) {
    console.warn('Toast 元素缺失，消息：', msg);
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, 1800);
}
