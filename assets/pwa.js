(function () {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported in this browser.');
    return;
  }

  window.addEventListener('load', () => {
    const swUrl = `${window.location.origin}/sw.js`;
    navigator.serviceWorker
      .register(swUrl)
      .then(reg => {
        console.info('Service Worker registered:', reg.scope);
      })
      .catch(err => {
        console.error('Service Worker registration failed:', err);
      });
  });
})();
