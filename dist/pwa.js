(() => {
  const BANNER_ID = 'connectionStatus';
  function updateConnectionStatus() {
    const existing = document.getElementById(BANNER_ID);
    if (navigator.onLine) { existing?.remove(); return; }
    if (document.getElementById('dataStrip') || document.getElementById('detailHealth')) return;
    const banner = document.createElement('div'); banner.id = BANNER_ID; banner.className = 'data-strip delayed'; banner.setAttribute('role', 'status'); banner.textContent = '当前离线 · 页面内容来自本机缓存，不能视为最新信息';
    document.body.prepend(banner);
  }
  addEventListener('online', updateConnectionStatus);
  addEventListener('offline', updateConnectionStatus);
  updateConnectionStatus();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
