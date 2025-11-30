(function () {
  const canInstall = 'serviceWorker' in navigator && window.isSecureContext;
  let deferredPrompt = null;
  let manualHintTimeout = null;
  const INSTALL_BUTTON_ID = 'pwa-install-button';
  const INSTALL_HINT_ID = 'pwa-install-hint';

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  const removeInstallButton = () => {
    const existing = document.getElementById(INSTALL_BUTTON_ID);
    if (existing) {
      existing.remove();
    }
  };

  const removeManualHint = () => {
    const existing = document.getElementById(INSTALL_HINT_ID);
    if (existing) existing.remove();
    if (manualHintTimeout) clearTimeout(manualHintTimeout);
  };

  const renderManualHint = () => {
    if (document.getElementById(INSTALL_HINT_ID) || isStandalone() || deferredPrompt) return;

    const hint = document.createElement('div');
    hint.id = INSTALL_HINT_ID;
    hint.textContent = '在 Chrome 菜单中选择“添加到主屏幕”即可安装';
    Object.assign(hint.style, {
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      right: '16px',
      padding: '12px 14px',
      background: '#0f172a',
      color: '#e2e8f0',
      fontSize: '13px',
      borderRadius: '12px',
      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.35)',
      zIndex: 9998,
    });

    document.body.appendChild(hint);
  };

  const renderInstallButton = () => {
    if (document.getElementById(INSTALL_BUTTON_ID) || isStandalone() || !deferredPrompt) return;

    const button = document.createElement('button');
    button.id = INSTALL_BUTTON_ID;
    button.textContent = '安装到主屏幕';
    Object.assign(button.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      padding: '12px 16px',
      background: '#2563eb',
      color: '#ffffff',
      border: 'none',
      borderRadius: '12px',
      fontSize: '14px',
      boxShadow: '0 10px 25px rgba(37, 99, 235, 0.35)',
      cursor: 'pointer',
      zIndex: 9999,
    });

    button.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      button.disabled = true;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome !== 'accepted') {
        button.disabled = false;
        button.textContent = '请在菜单中选择“添加到主屏幕”';
      } else {
        removeInstallButton();
      }
      deferredPrompt = null;
    });

    document.body.appendChild(button);
  };

  if (!canInstall) {
    console.warn('Service Worker or secure context not available.');
    return;
  }

  const registerServiceWorker = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => {
        console.info('Service Worker registered:', reg.scope);
      })
      .catch(err => {
        console.error('Service Worker registration failed:', err);
      });
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    removeManualHint();
    renderInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    removeInstallButton();
    removeManualHint();
  });

  if (!isStandalone()) {
    registerServiceWorker();
    manualHintTimeout = window.setTimeout(renderManualHint, 4000);
  }
})();
