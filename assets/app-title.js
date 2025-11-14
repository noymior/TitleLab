// assets/app-title.js
// 标题管理页核心逻辑（v1 修正版）

// 依赖：
// - window.supabaseClient（由 assets/supabase.js 创建）
// - window.gsap（可选，用于动画）
// - window.classifyTitleText(text)（可选：关键词识别，没有时会降级为简单保存）

(function () {
  // -----------------------------
  // 全局状态
  // -----------------------------
  const state = {
    titles: [],          // 所有标题
    filtered: [],        // 过滤后用于渲染的列表
    categories: [],      // 主分类（亲子/情侣/…）
    currentCategory: '全部',
    search: '',
    sceneFilter: '全部',
    contentTypeFilter: '全部'
  };

  // 默认分类
  const DEFAULT_CATEGORIES = [
    '亲子',
    '情侣',
    '闺蜜',
    '单人',
    '烟花',
    '夜景'
  ];

  // 本地存储 key（只存分类，不存标题）
  const LS_KEY_CATEGORIES = 'titlehub_categories';

  // -----------------------------
  // DOM 缓存
  // -----------------------------
  const dom = {};

  function cacheDom() {
    dom.searchInput = document.getElementById('titleSearchInput');
    dom.sceneSelect = document.getElementById('sceneFilter');
    dom.contentTypeSelect = document.getElementById('contentTypeFilter');

    dom.btnAdd = document.getElementById('btnAddTitle');
    dom.btnBulk = document.getElementById('btnBulkImport');
    dom.btnClearAll = document.getElementById('btnClearAll');
    dom.btnSettings = document.getElementById('btnOpenSettings');
    dom.btnSaveCloud = document.getElementById('btnSaveCloud');
    dom.btnLoadCloud = document.getElementById('btnLoadCloud');
    dom.btnGoAdmin = document.getElementById('btnGoAdmin');

    dom.categoryBar = document.getElementById('categoryBar');
    dom.list = document.getElementById('titleList'); // 列表容器（ul / div）

    // 弹窗相关
    dom.modal = document.getElementById('titleModal');
    dom.modalTitleInput = document.getElementById('modalTitleText');
    dom.modalCategorySelect = document.getElementById('modalMainCategory');
    dom.modalSceneInput = document.getElementById('modalSceneTags');
    dom.modalContentTypeSelect = document.getElementById('modalContentType');
    dom.modalIdHidden = document.getElementById('modalTitleId'); // hidden，用于编辑
    dom.btnModalSave = document.getElementById('btnModalSave');
    dom.btnModalCancel = document.getElementById('btnModalCancel');

    dom.toast = document.getElementById('toast');
  }

  // -----------------------------
  // 工具函数
  // -----------------------------
  function showToast(message, type = 'info') {
    if (!dom.toast) {
      alert(message);
      return;
    }
    dom.toast.textContent = message;
    dom.toast.className = ''; // 清空
    dom.toast.classList.add('toast');
    dom.toast.classList.add(type === 'error' ? 'toast-error' : 'toast-info');

    dom.toast.style.opacity = '1';
    if (window.gsap) {
      gsap.fromTo(
        dom.toast,
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.2 }
      );
    }

    clearTimeout(dom.toast._timer);
    dom.toast._timer = setTimeout(() => {
      if (window.gsap) {
        gsap.to(dom.toast, { opacity: 0, duration: 0.25 });
      } else {
        dom.toast.style.opacity = '0';
      }
    }, 2200);
  }

  function safeParseJSON(str, fallback) {
    try {
      const v = JSON.parse(str);
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }

  // -----------------------------
  // 分类持久化：localStorage
  // -----------------------------
  function loadCategoriesFromStorage() {
    const raw = localStorage.getItem(LS_KEY_CATEGORIES);
    if (!raw) {
      state.categories = [...DEFAULT_CATEGORIES];
      return;
    }
    const list = safeParseJSON(raw, []);
    if (!Array.isArray(list) || list.length === 0) {
      state.categories = [...DEFAULT_CATEGORIES];
    } else {
      state.categories = list;
    }
  }

  function saveCategoriesToStorage() {
    localStorage.setItem(LS_KEY_CATEGORIES, JSON.stringify(state.categories));
  }

  // -----------------------------
  // 分类渲染 & 操作
  // -----------------------------
  function renderCategories() {
    if (!dom.categoryBar) return;

    dom.categoryBar.innerHTML = '';

    // “全部”固定在最前
    const allChip = createCategoryChip('全部', state.currentCategory === '全部');
    dom.categoryBar.appendChild(allChip);

    state.categories.forEach((name) => {
      const chip = createCategoryChip(
        name,
        state.currentCategory === name
      );
      dom.categoryBar.appendChild(chip);
    });

    // 新增分类按钮
    const addBtn = document.createElement('button');
    addBtn.className = 'chip chip-ghost';
    addBtn.textContent = '+ 新增分类';
    addBtn.addEventListener('click', onAddCategoryClick);
    dom.categoryBar.appendChild(addBtn);
  }

  function createCategoryChip(name, active) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = name;
    if (active) btn.classList.add('chip-active');

    btn.addEventListener('click', () => {
      state.currentCategory = name;
      filterAndRender();
      renderCategories();
    });

    return btn;
  }

  function onAddCategoryClick() {
    const name = prompt('请输入新的分类名称（例：港迪城堡/烟花/夜景）：');
    if (!name) return;

    if (state.categories.includes(name)) {
      showToast('该分类已存在', 'error');
      return;
    }
    state.categories.push(name);
    saveCategoriesToStorage();
    renderCategories();
    showToast('分类已新增');
  }

  // -----------------------------
  // Supabase 读写
  // -----------------------------
  async function loadTitles(showToastAfter = false) {
    if (!window.supabaseClient) {
      console.error('supabaseClient 不存在，请检查 supabase.js');
      showToast('Supabase 未初始化', 'error');
      return;
    }

    const { data, error } = await window.supabaseClient
      .from('titles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('loadTitles error', error);
      showToast('读取标题失败：' + error.message, 'error');
      return;
    }

    // 确保使用 text 字段
    state.titles = (data || []).map((row) => ({
      id: row.id,
      text: row.text || '',
      main_category: row.main_category || '',
      scene_tags: row.scene_tags || [],
      content_type: row.content_type || '',
      intent_tags: row.intent_tags || [],
      keywords: row.keywords || [],
      usage_count: row.usage_count || 0,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    filterAndRender();

    if (showToastAfter) {
      showToast('已从云端加载最新数据');
    }
  }

  async function insertTitle(payload) {
    const { data, error } = await window.supabaseClient
      .from('titles')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async function updateTitle(id, patch) {
    const { data, error } = await window.supabaseClient
      .from('titles')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async function deleteTitle(id) {
    const { error } = await window.supabaseClient
      .from('titles')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // -----------------------------
  // 列表过滤 & 渲染
  // -----------------------------
  function filterAndRender() {
    const q = (state.search || '').trim().toLowerCase();
    const cat = state.currentCategory;
    const scene = state.sceneFilter;
    const ctype = state.contentTypeFilter;

    let list = [...state.titles];

    if (cat && cat !== '全部') {
      list = list.filter((item) => item.main_category === cat);
    }

    if (q) {
      list = list.filter((item) =>
        (item.text || '').toLowerCase().includes(q)
      );
    }

    if (scene && scene !== '全部') {
      list = list.filter((item) =>
        Array.isArray(item.scene_tags) &&
        item.scene_tags.includes(scene)
      );
    }

    if (ctype && ctype !== '全部') {
      list = list.filter((item) => item.content_type === ctype);
    }

    state.filtered = list;
    renderList();
  }

  function renderList() {
    if (!dom.list) return;
    dom.list.innerHTML = '';

    if (state.filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '尚无标题，请点击「新增标题」添加。';
      dom.list.appendChild(empty);
      return;
    }

    state.filtered.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'title-row';

      const text = document.createElement('div');
      text.className = 'title-text';
      text.textContent = item.text;

      const tags = document.createElement('div');
      tags.className = 'title-tags';

      if (item.main_category) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = item.main_category;
        tags.appendChild(tag);
      }

      if (Array.isArray(item.scene_tags)) {
        item.scene_tags.forEach((s) => {
          const tag = document.createElement('span');
          tag.className = 'tag tag-soft';
          tag.textContent = s;
          tags.appendChild(tag);
        });
      }

      if (item.content_type) {
        const tag = document.createElement('span');
        tag.className = 'tag tag-outline';
        tag.textContent = item.content_type;
        tags.appendChild(tag);
      }

      const right = document.createElement('div');
      right.className = 'title-actions';

      const btnCopy = document.createElement('button');
      btnCopy.className = 'btn-ghost';
      btnCopy.textContent = '复制';
      btnCopy.addEventListener('click', () => onCopyTitle(item));

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn-ghost';
      btnEdit.textContent = '修改';
      btnEdit.addEventListener('click', () => openModalForEdit(item));

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn-ghost btn-danger';
      btnDelete.textContent = '删除';
      btnDelete.addEventListener('click', () => onDeleteTitle(item));

      right.appendChild(btnCopy);
      right.appendChild(btnEdit);
      right.appendChild(btnDelete);

      row.appendChild(text);
      row.appendChild(tags);
      row.appendChild(right);

      dom.list.appendChild(row);

      if (window.gsap) {
        gsap.from(row, {
          opacity: 0,
          y: 6,
          duration: 0.18,
          ease: 'power1.out'
        });
      }
    });
  }

  // -----------------------------
  // 按钮行为：复制 / 修改 / 删除
  // -----------------------------
  async function onCopyTitle(item) {
    try {
      await navigator.clipboard.writeText(item.text || '');
      showToast('已复制到剪贴板');
    } catch (e) {
      console.error(e);
      showToast('复制失败，请手动选择文本', 'error');
    }

    // 更新使用次数（乐观更新）
    const idx = state.titles.findIndex((t) => t.id === item.id);
    if (idx >= 0) {
      state.titles[idx].usage_count = (state.titles[idx].usage_count || 0) + 1;
    }
    try {
      await updateTitle(item.id, {
        usage_count: (item.usage_count || 0) + 1
      });
    } catch (e) {
      console.warn('usage_count 更新失败，仅本地增加', e);
    }
  }

  async function onDeleteTitle(item) {
    if (!confirm('确定要删除这个标题吗？此操作不可恢复。')) return;

    // 先从 UI 移除
    state.titles = state.titles.filter((t) => t.id !== item.id);
    filterAndRender();

    try {
      await deleteTitle(item.id);
      showToast('已删除');
    } catch (e) {
      console.error(e);
      showToast('删除失败：' + e.message, 'error');
      // 失败时重新加载一次，防止本地状态和云端不一致
      loadTitles();
    }
  }

  // -----------------------------
  // 弹窗：新增 / 修改
  // -----------------------------
  function openModalForNew() {
    if (!dom.modal) return;

    dom.modalTitleInput.value = '';
    dom.modalSceneInput.value = '';
    dom.modalContentTypeSelect.value = '展示';
    dom.modalCategorySelect.value =
      state.currentCategory === '全部' ? '' : state.currentCategory;
    dom.modalIdHidden.value = '';

    dom.modal.style.display = 'flex';
    if (window.gsap) {
      gsap.fromTo(
        dom.modal,
        { opacity: 0 },
        { opacity: 1, duration: 0.2 }
      );
    }
    dom.modalTitleInput.focus();
  }

  function openModalForEdit(item) {
    if (!dom.modal) return;

    dom.modalTitleInput.value = item.text || '';
    dom.modalSceneInput.value = Array.isArray(item.scene_tags)
      ? item.scene_tags.join('、')
      : '';
    dom.modalContentTypeSelect.value = item.content_type || '展示';
    dom.modalCategorySelect.value = item.main_category || '';
    dom.modalIdHidden.value = item.id;

    dom.modal.style.display = 'flex';
    if (window.gsap) {
      gsap.fromTo(
        dom.modal,
        { opacity: 0 },
        { opacity: 1, duration: 0.2 }
      );
    }
    dom.modalTitleInput.focus();
  }

  function closeModal() {
    if (!dom.modal) return;
    if (window.gsap) {
      gsap.to(dom.modal, {
        opacity: 0,
        duration: 0.2,
        onComplete: () => {
          dom.modal.style.display = 'none';
        }
      });
    } else {
      dom.modal.style.display = 'none';
    }
  }

  async function onModalSave() {
    const text = (dom.modalTitleInput.value || '').trim();
    if (!text) {
      showToast('标题不能为空', 'error');
      dom.modalTitleInput.focus();
      return;
    }

    let mainCategory = dom.modalCategorySelect.value || null;
    let sceneText = (dom.modalSceneInput.value || '').trim();
    let contentType = dom.modalContentTypeSelect.value || null;

    // 如果有识别引擎，则优先用规则识别结果
    if (typeof window.classifyTitleText === 'function') {
      try {
        const classified = window.classifyTitleText(text);
        if (classified.main_category) mainCategory = classified.main_category;
        if (Array.isArray(classified.scene_tags)) {
          sceneText = classified.scene_tags.join('、');
        }
        if (classified.content_type) {
          contentType = classified.content_type;
        }
      } catch (e) {
        console.warn('classifyTitleText 执行失败，降级为手动输入', e);
      }
    }

    const sceneTags = sceneText
      ? sceneText
          .split(/[,，、]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const basePayload = {
      text,
      main_category: mainCategory,
      scene_tags: sceneTags,
      content_type: contentType,
      intent_tags: [],
      keywords: [],
      usage_count: 0
    };

    const editingId = dom.modalIdHidden.value;

    if (!window.supabaseClient) {
      showToast('Supabase 未初始化，无法保存', 'error');
      return;
    }

    try {
      if (editingId) {
        // 编辑
        const updated = await updateTitle(editingId, basePayload);

        // 同步到本地 state
        const idx = state.titles.findIndex((t) => t.id === editingId);
        if (idx >= 0) {
          state.titles[idx] = {
            ...state.titles[idx],
            ...updated
          };
        }
        showToast('已更新');
      } else {
        // 新增：先乐观更新本地，再插入 Supabase
        const tempId = 'temp-' + Date.now();
        const tempItem = {
          id: tempId,
          ...basePayload,
          created_at: new Date().toISOString()
        };
        state.titles.unshift(tempItem);
        filterAndRender();

        try {
          const inserted = await insertTitle(basePayload);
          // 用真实记录替换临时记录
          const idx = state.titles.findIndex((t) => t.id === tempId);
          if (idx >= 0) {
            state.titles[idx] = {
              ...state.titles[idx],
              ...inserted
            };
          }
          showToast('已新增');
        } catch (innerErr) {
          // 如果插入失败，把临时记录删掉
          console.error('insertTitle failed', innerErr);
          state.titles = state.titles.filter((t) => t.id !== tempId);
          filterAndRender();
          throw innerErr;
        }
      }
      filterAndRender();
      closeModal();
    } catch (e) {
      console.error(e);
      showToast('保存失败：' + e.message, 'error');
    }
  }

  // -----------------------------
  // 顶部工具条按钮行为
  // -----------------------------
  async function onClearAllClick() {
    if (!window.supabaseClient) {
      showToast('Supabase 未初始化', 'error');
      return;
    }
    const ok = confirm(
      '确定要删除「所有标题」吗？\n\n这是一个硬删除操作，会直接清空 Supabase titles 表，请谨慎确认。'
    );
    if (!ok) return;

    try {
      const { error } = await window.supabaseClient
        .from('titles')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // 防御式条件

      if (error) throw error;

      state.titles = [];
      filterAndRender();
      showToast('已清空全部标题');
    } catch (e) {
      console.error(e);
      showToast('清空失败：' + e.message, 'error');
    }
  }

  function onSettingsClick() {
    // 先做一个轻量版“设置”：告诉你当前是实时云端写入
    alert(
      '设置页面（预留功能）\n\n当前版本：所有数据实时保存在 Supabase，无本地缓存。\n后续可以在这里加入：\n- 关键词规则管理\n- 默认分类管理\n- 导出/导入配置等。'
    );
  }

  function onSaveCloudClick() {
    // 当前架构已经是“实时云端保存”，这里给出明确反馈即可
    showToast('当前标题数据已实时写入 Supabase，无需另行保存');
  }

  async function onLoadCloudClick() {
    await loadTitles(true);
  }

  function onGoAdminClick() {
    // 参考旧项目：跳转到 admin.html（如果没有该页面，可以改为 index.html）
    if (window.location.pathname.endsWith('admin.html')) return;
    if (confirm('跳转到管理页面？')) {
      window.location.href = 'admin.html';
    }
  }

  // -----------------------------
  // 批量导入（v1：简单版，只做一行一个标题）
  // -----------------------------
  function onBulkImportClick() {
    const text = prompt(
      '请粘贴多行标题，每行一个标题：\n（后续会在这里做更智能的自动分类和预览）'
    );
    if (!text) return;

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      showToast('没有检测到有效标题行', 'error');
      return;
    }

    // 逐条调用新增逻辑（简单版本）
    (async () => {
      for (const line of lines) {
        // 只传 text，其余让 Supabase 默认
        try {
          const basePayload = {
            text: line,
            main_category: state.currentCategory === '全部'
              ? null
              : state.currentCategory,
            scene_tags: [],
            content_type: null,
            intent_tags: [],
            keywords: [],
            usage_count: 0
          };

          const tempId = 'temp-' + Date.now() + Math.random();
          const tempItem = {
            id: tempId,
            ...basePayload,
            created_at: new Date().toISOString()
          };
          state.titles.unshift(tempItem);
          filterAndRender();

          try {
            const inserted = await insertTitle(basePayload);
            const idx = state.titles.findIndex((t) => t.id === tempId);
            if (idx >= 0) state.titles[idx] = { ...tempItem, ...inserted };
          } catch (err) {
            console.error('batch insert failed', err);
            state.titles = state.titles.filter((t) => t.id !== tempId);
            filterAndRender();
          }
        } catch (e) {
          console.error(e);
        }
      }
      showToast('批量导入完成');
      // 最后再从云端刷新一次，防止本地状态偏差
      loadTitles();
    })();
  }

  // -----------------------------
  // 事件绑定
  // -----------------------------
  function bindEvents() {
    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', (e) => {
        state.search = e.target.value || '';
        filterAndRender();
      });
    }

    if (dom.sceneSelect) {
      dom.sceneSelect.addEventListener('change', (e) => {
        state.sceneFilter = e.target.value || '全部';
        filterAndRender();
      });
    }

    if (dom.contentTypeSelect) {
      dom.contentTypeSelect.addEventListener('change', (e) => {
        state.contentTypeFilter = e.target.value || '全部';
        filterAndRender();
      });
    }

    if (dom.btnAdd) dom.btnAdd.addEventListener('click', openModalForNew);
    if (dom.btnBulk) dom.btnBulk.addEventListener('click', onBulkImportClick);
    if (dom.btnClearAll) dom.btnClearAll.addEventListener('click', onClearAllClick);
    if (dom.btnSettings) dom.btnSettings.addEventListener('click', onSettingsClick);
    if (dom.btnSaveCloud) dom.btnSaveCloud.addEventListener('click', onSaveCloudClick);
    if (dom.btnLoadCloud) dom.btnLoadCloud.addEventListener('click', onLoadCloudClick);
    if (dom.btnGoAdmin) dom.btnGoAdmin.addEventListener('click', onGoAdminClick);

    if (dom.btnModalSave) dom.btnModalSave.addEventListener('click', onModalSave);
    if (dom.btnModalCancel) dom.btnModalCancel.addEventListener('click', closeModal);

    // 点击遮罩关闭弹窗
    if (dom.modal) {
      dom.modal.addEventListener('click', (e) => {
        if (e.target === dom.modal) {
          closeModal();
        }
      });
    }
  }

  // -----------------------------
  // 初始化
  // -----------------------------
  async function init() {
    cacheDom();
    bindEvents();
    loadCategoriesFromStorage();
    renderCategories();
    await loadTitles();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
