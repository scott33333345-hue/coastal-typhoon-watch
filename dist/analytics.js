(() => {
  const EVENT_KEY = 'coastal-watch-analytics-events-v1';
  const SESSION_KEY = 'coastal-watch-analytics-session-v1';
  const LIMIT = 200;
  const allowedKeys = new Set(['page','storm_id','city_id','mode','data_state','using_cache','data_age_bucket','forecast_hours','followed','share_method','result','viewport','source','reason','enabled_count']);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const now = Date.now();
  let session = read(SESSION_KEY, null);
  if (!session || !session.id || now - session.createdAt > 86400000) { session = { id: crypto.randomUUID?.() || `${now}-${Math.random().toString(16).slice(2)}`, createdAt: now }; write(SESSION_KEY, session); }
  const page = location.pathname.split('/').pop() || 'index.html';
  const viewport = innerWidth < 600 ? 'mobile' : innerWidth < 1000 ? 'tablet' : 'desktop';

  function sanitize(properties = {}) {
    const clean = {};
    Object.entries(properties).forEach(([key, value]) => { if (allowedKeys.has(key) && ['string','number','boolean'].includes(typeof value)) clean[key] = value; });
    return clean;
  }
  function events() { return read(EVENT_KEY, []); }
  function track(name, properties = {}) {
    if (!/^[a-z][a-z0-9_]{2,50}$/.test(name)) return false;
    const list = events(); list.push({ name, at: new Date().toISOString(), session_id: session.id, properties: sanitize({ page, viewport, ...properties }) });
    const saved = write(EVENT_KEY, list.slice(-LIMIT)); if (saved) renderPanel(); return saved;
  }
  function funnelCount(list) { const names = new Set(list.filter((item) => item.session_id === session.id).map((item) => item.name)); return ['data_load_completed','local_impact_rendered'].every((name) => names.has(name)) && ['track_opened','official_source_opened','typhoon_detail_opened','follow_changed','share_completed'].some((name) => names.has(name)) ? 1 : 0; }
  function renderPanel() {
    const panel = document.querySelector('.analytics-panel'); if (!panel) return;
    const list = events(); const sessionEvents = list.filter((item) => item.session_id === session.id); const failures = sessionEvents.filter((item) => ['fallback_displayed','map_fallback_displayed','client_error_detected'].includes(item.name)).length;
    panel.querySelector('.analytics-summary').innerHTML = `<div><span>当前会话</span><strong>${sessionEvents.length}</strong></div><div><span>完成决策路径</span><strong>${funnelCount(list) ? '是' : '否'}</strong></div><div><span>异常事件</span><strong>${failures}</strong></div>`;
    const target = panel.querySelector('.analytics-list'); target.replaceChildren();
    sessionEvents.slice().reverse().forEach((item) => { const li = document.createElement('li'); const code = document.createElement('code'); const time = document.createElement('time'); const pre = document.createElement('pre'); code.textContent = item.name; time.textContent = new Date(item.at).toLocaleTimeString('zh-CN',{hour12:false}); pre.textContent = JSON.stringify(item.properties); li.append(code,time,pre); target.append(li); });
    panel.querySelector('.analytics-empty').hidden = sessionEvents.length > 0;
  }
  function mountPanel() {
    if (!new URLSearchParams(location.search).has('analytics')) return;
    const panel = document.createElement('aside'); panel.className = 'analytics-panel'; panel.setAttribute('aria-label','本地分析调试面板');
    panel.innerHTML = `<div class="analytics-head"><div><h2>本地事件调试</h2><p>仅保存在本机 · 会话 ${session.id.slice(0,8)}</p></div><div class="analytics-actions"><button type="button" data-clear>清空</button><button type="button" data-close>关闭</button></div></div><div class="analytics-summary"></div><p class="analytics-empty">当前会话还没有事件。</p><ol class="analytics-list"></ol>`;
    document.body.append(panel); panel.querySelector('[data-clear]').onclick = () => { write(EVENT_KEY, []); renderPanel(); }; panel.querySelector('[data-close]').onclick = () => { panel.remove(); const button=document.createElement('button');button.className='analytics-badge';button.textContent='分析调试';button.onclick=()=>{button.remove();mountPanel();};document.body.append(button); }; renderPanel();
  }
  window.coastalAnalytics = { track, events, sessionId: session.id };
  addEventListener('error', (event) => track('client_error_detected', { reason: String(event.message || 'unknown').slice(0,80) }));
  addEventListener('unhandledrejection', () => track('client_error_detected', { reason: 'unhandled_promise' }));
  addEventListener('DOMContentLoaded', () => { mountPanel(); track('page_viewed'); });
})();
