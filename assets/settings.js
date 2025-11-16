const DISPLAY_SETTINGS_KEY = 'display_settings_v1';
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
    input.addEventListener('input', (e) => {
      saveDisplaySettings({ [key]: e.target.value });
    });
  }
}

function bindTextInput(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = settingsState[key] || '';
  if (!input.dataset.bound) {
    input.dataset.bound = '1';
    input.addEventListener('input', (e) => {
      saveDisplaySettings({ [key]: e.target.value.trim() });
    });
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
    row.className = 'panel mb-2 flex items-center justify-between';

    const name = document.createElement('div');
    name.className = 'text-sm font-medium';
    name.textContent = scene;

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'function-btn ghost text-xs btn-inline';
    editBtn.textContent = '修改';
    editBtn.addEventListener('click', () => {
      const next = prompt('修改场景名称', scene);
      if (next === null) return;
      const trimmed = next.trim();
      if (!trimmed) return;
      const dup = settingsState.scenes.some(
        (item, idx) => item === trimmed && idx !== index
      );
      if (dup) {
        showSettingsToast('已存在同名场景');
        return;
      }
      settingsState.scenes[index] = trimmed;
      saveDisplaySettings({ scenes: [...settingsState.scenes] });
      renderSceneList();
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

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
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
}

document.addEventListener('DOMContentLoaded', initSettingsPage);
