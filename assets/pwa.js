(function () {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported in this browser.');
    return;
  }

  window.addEventListener('load', () => {
    // 使用相对路径，适配 GitHub Pages 子目录部署
    const swUrl = './sw.js';
    navigator.serviceWorker
      .register(swUrl, { scope: './' })
      .then(reg => {
        console.info('Service Worker registered:', reg.scope);
      })
      .catch(err => {
        console.error('Service Worker registration failed:', err);
      });
  });
})();
