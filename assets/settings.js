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

let settingsState = { ...DEFAULT_DISPLAY_SETTINGS };

function loadDisplaySettings() {
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
    console.error('[Settings] 解析显示设置失败', e);
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

function saveDisplaySettings(nextSettings) {
  settingsState = { ...settingsState, ...nextSettings };
  localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settingsState));
  applyDisplayPreview();
  showSettingsToast('已保存并应用');
}

function applyDisplayPreview() {
  const root = document.documentElement;
  root.style.setProperty('--brand-blue', settingsState.brandColor);
  root.style.setProperty('--brand-blue-hover', settingsState.brandHover);
  root.style.setProperty('--ghost-bg', settingsState.ghostColor);
  root.style.setProperty('--ghost-hover', settingsState.ghostHover);
  root.style.setProperty('--table-stripe', settingsState.stripeColor);
  root.style.setProperty('--list-hover', settingsState.hoverColor);
  root.style.setProperty('--topbar-title-color', settingsState.titleColor);

  const previewTitle = document.getElementById('titlePreview');
  if (previewTitle) {
    previewTitle.textContent = settingsState.titleText ||
      DEFAULT_DISPLAY_SETTINGS.titleText;
    previewTitle.style.color = settingsState.titleColor;
  }
}

function bindColorInput(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = settingsState[key];
  if (!input.dataset.bound) {
    input.dataset.bound = '1';
    const fn = debounce((val) => {
      if (isValidCssColor(val)) {
        saveDisplaySettings({ [key]: val });
      } else {
        showSettingsToast('颜色格式无效');
      }
    }, 300);
    input.addEventListener('input', (e) => fn(e.target.value));
  }
}

function bindTextInput(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = settingsState[key] || '';
  if (!input.dataset.bound) {
    input.dataset.bound = '1';
    const fn = debounce((val) => {
      saveDisplaySettings({ [key]: val.trim() });
    }, 300);
    input.addEventListener('input', (e) => fn(e.target.value));
  }
}

function renderSceneList() {
  const list = document.getElementById('sceneList');
  if (!list) return;
  list.innerHTML = '';

  if (!settingsState.scenes.length) {
    const empty = document.createElement('div');
    empty.className = 'text-sm text-gray-500';
    empty.textContent = '暂无场景，请添加';
    list.appendChild(empty);
    return;
  }

  settingsState.scenes.forEach((scene, index) => {
    const row = document.createElement('div');
    row.className = 'panel mb-2';

    const name = document.createElement('div');
    name.className = 'text-base font-medium';
    name.style.marginBottom = '8px';
    name.textContent = scene;

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'function-btn ghost text-xs btn-inline';
    editBtn.textContent = '修改';
    editBtn.addEventListener('click', () => {
      const editor = document.createElement('input');
      editor.type = 'text';
      editor.className = 'field-input';
      editor.value = scene;
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'function-btn text-xs btn-inline';
      saveBtn.textContent = '保存';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'function-btn ghost text-xs btn-inline';
      cancelBtn.textContent = '取消';
      const area = document.createElement('div');
      area.className = 'flex items-center gap-2';
      area.appendChild(editor);
      area.appendChild(saveBtn);
      area.appendChild(cancelBtn);
      row.replaceChild(area, name);
      saveBtn.addEventListener('click', () => {
        const trimmed = (editor.value || '').trim();
        if (!trimmed) return;
        const dup = settingsState.scenes.some((item, idx) => item === trimmed && idx !== index);
        if (dup) { showSettingsToast('已存在同名场景'); return; }
        settingsState.scenes[index] = trimmed;
        saveDisplaySettings({ scenes: [...settingsState.scenes] });
        renderSceneList();
      });
      cancelBtn.addEventListener('click', () => { renderSceneList(); });
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'function-btn ghost text-xs btn-inline';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => {
      settingsState.scenes.splice(index, 1);
      saveDisplaySettings({ scenes: [...settingsState.scenes] });
      renderSceneList();
    });

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'function-btn ghost text-xs btn-inline';
    upBtn.textContent = '上移';
    upBtn.addEventListener('click', () => {
      if (index <= 0) return;
      const arr = [...settingsState.scenes];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      saveDisplaySettings({ scenes: arr });
      renderSceneList();
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'function-btn ghost text-xs btn-inline';
    downBtn.textContent = '下移';
    downBtn.addEventListener('click', () => {
      if (index >= settingsState.scenes.length - 1) return;
      const arr = [...settingsState.scenes];
      [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
      saveDisplaySettings({ scenes: arr });
      renderSceneList();
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    row.appendChild(name);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

function bindSceneAdder() {
  const input = document.getElementById('newSceneInput');
  const btn = document.getElementById('btnAddScene');
  if (!input || !btn) return;

  btn.addEventListener('click', () => {
    const value = input.value.trim();
    if (!value) return;
    if (settingsState.scenes.includes(value)) {
      showSettingsToast('场景已存在');
      return;
    }
    settingsState.scenes.push(value);
    input.value = '';
    saveDisplaySettings({ scenes: [...settingsState.scenes] });
    renderSceneList();
  });
}

function bindResetButton() {
  const btn = document.getElementById('btnResetSettings');
  if (!btn) return;
  btn.addEventListener('click', () => {
    settingsState = { ...DEFAULT_DISPLAY_SETTINGS };
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settingsState));
    hydrateFormValues();
    applyDisplayPreview();
    showSettingsToast('已恢复默认');
  });
}

function bindImportExport() {
  const btnExp = document.getElementById('btnExportSettings');
  const btnImp = document.getElementById('btnImportSettings');
  const fileInput = document.getElementById('settingsFileInput');
  if (btnExp) btnExp.addEventListener('click', () => {
    const payload = { key: DISPLAY_SETTINGS_KEY, version: 'v1', savedAt: Date.now(), data: settingsState };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `settings-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showSettingsToast('已导出设置');
  });
  if (btnImp && fileInput) {
    btnImp.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        if (!payload || !payload.data || typeof payload.data !== 'object') throw new Error('格式错误');
        const next = { ...DEFAULT_DISPLAY_SETTINGS, ...payload.data };
        const scenes = Array.isArray(next.scenes) ? next.scenes.filter(Boolean) : [];
        settingsState = { ...next, scenes };
        localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settingsState));
        hydrateFormValues();
        applyDisplayPreview();
        showSettingsToast('已导入并应用');
      } catch (_) {
        showSettingsToast('导入失败');
      } finally {
        e.target.value = '';
      }
    });
  }
}

function hydrateFormValues() {
  bindTextInput('titleTextInput', 'titleText');
  bindColorInput('titleColorInput', 'titleColor');
  bindColorInput('brandColorInput', 'brandColor');
  bindColorInput('brandHoverInput', 'brandHover');
  bindColorInput('ghostColorInput', 'ghostColor');
  bindColorInput('ghostHoverInput', 'ghostHover');
  bindColorInput('stripeColorInput', 'stripeColor');
  bindColorInput('hoverColorInput', 'hoverColor');
  renderSceneList();
}

function showSettingsToast(msg) {
  const el = document.getElementById('settingsToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 1600);
}

function initSettingsPage() {
  settingsState = loadDisplaySettings();
  hydrateFormValues();
  applyDisplayPreview();
  bindSceneAdder();
  bindResetButton();
  bindImportExport();
  const user = getCurrentUser();
  const badge = document.getElementById('currentUserName');
  if (user && badge) badge.textContent = user.username;
  const btnLogout = document.getElementById('btnLogout');
  const btnLoginHeader = document.getElementById('btnLoginHeader');
  if (btnLogout) btnLogout.onclick = () => { try { localStorage.removeItem('current_user_v1'); } catch (_) {} window.location.href = 'login.html'; };
  if (btnLoginHeader) btnLoginHeader.onclick = () => { window.location.href = 'login.html'; };
  if (btnLogout) btnLogout.classList.remove('hidden');
  if (btnLoginHeader) btnLoginHeader.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', initSettingsPage);

function getCurrentUser() {
  try { const raw = localStorage.getItem('current_user_v1'); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}

function debounce(fn, delay) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

function isValidCssColor(val) {
  const s = new Option().style;
  s.color = '';
  s.color = val;
  return s.color !== '';
}
