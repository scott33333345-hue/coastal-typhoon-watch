const $ = (selector) => document.querySelector(selector);
const DATA_URL = 'data/typhoon.json';
const XIAMEN = { name: '福建·厦门', latitude: 24.4798, longitude: 118.0894 };
const STORAGE = { followed: 'coastal-watch-followed', reminders: 'coastal-watch-reminders', snapshots: 'coastal-watch-snapshots', city: 'coastal-watch-city' };
let payload;
let storm;
let selectedHours = 72;
let map;
let pathLayer;
let currentImpact;
let currentHealth;
let mapFallbackTracked = false;
let dialogOpener;
const track = (name, properties = {}) => window.coastalAnalytics?.track(name, properties);

function safe(value, fallback = '来源暂未提供') { return value === null || value === undefined || value === '' ? fallback : value; }
function parseTime(value) { return value ? new Date(value.replace(' ', 'T') + (value.includes('T') ? '' : '+08:00')) : null; }
function formatTime(value, withYear = false) {
  const date = value instanceof Date ? value : parseTime(value);
  if (!date || Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...(withYear ? { year: 'numeric' } : {}), month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
function toRad(value) { return value * Math.PI / 180; }
function distanceKm(a, b) {
  const earth = 6371;
  const latDelta = toRad(b.latitude - a.latitude);
  const lonDelta = toRad(b.longitude - a.longitude);
  const value = Math.sin(latDelta / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(lonDelta / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
function bearingDegrees(origin, target) {
  const lat1 = toRad(origin.latitude); const lat2 = toRad(target.latitude); const lonDelta = toRad(target.longitude - origin.longitude);
  const y = Math.sin(lonDelta) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lonDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function directionName(value) { return ['北','东北','东','东南','南','西南','西','西北'][Math.round(value / 45) % 8]; }
function pointOf(raw) { return raw && Number.isFinite(raw.latitude) && Number.isFinite(raw.longitude) ? { latitude: raw.latitude, longitude: raw.longitude } : null; }
function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
function showMapFallback(reason, hideMap = false) {
  if (hideMap) $('#map').hidden = true;
  $('#mapFallback').hidden = false;
  if (!mapFallbackTracked) { track('map_fallback_displayed', { reason }); mapFallbackTracked = true; }
}

function freshness() {
  const fetched = new Date(payload.fetchedAt);
  const ageMinutes = (Date.now() - fetched.getTime()) / 60000;
  if (!Number.isFinite(ageMinutes)) return { state: 'failed', label: '数据时间无法验证' };
  if (ageMinutes > 180) return { state: 'delayed', label: `页面数据较旧 · 抓取于 ${formatTime(fetched)}` };
  return { state: 'healthy', label: `数据已读取 · 抓取于 ${formatTime(fetched)}` };
}

function ageBucket() {
  const ageHours = (Date.now() - new Date(payload.fetchedAt).getTime()) / 3600000;
  if (!Number.isFinite(ageHours)) return 'unknown';
  if (ageHours <= 3) return '0-3h';
  if (ageHours <= 24) return '3-24h';
  return '24h+';
}

function calculateImpact() {
  const latest = pointOf(storm?.latest);
  if (!latest) return null;
  const currentDistance = distanceKm(XIAMEN, latest);
  const bearing = directionName(bearingDegrees(XIAMEN, latest));
  const recent = (storm.track || []).filter(pointOf).slice(-3);
  let trend = '数据不足'; let trendWindow = '需要至少两个有效实况点';
  if (recent.length >= 2) {
    const first = distanceKm(XIAMEN, recent[0]); const last = distanceKm(XIAMEN, recent.at(-1)); const delta = last - first;
    trend = Math.abs(delta) < 15 ? '变化不明显' : delta < 0 ? '正在接近' : '正在远离';
    trendWindow = `${formatTime(recent[0].time)} 至 ${formatTime(recent.at(-1).time)}`;
  }
  const forecasts = (storm.forecast || []).filter(pointOf);
  const closest = forecasts.reduce((best, item) => {
    const value = distanceKm(XIAMEN, item);
    return !best || value < best.distance ? { item, distance: value } : best;
  }, null);
  return { currentDistance, bearing, trend, trendWindow, closest };
}

function renderImpact(impact) {
  if (!impact) {
    $('#impactTitle').textContent = '当前数据不足，暂无法判断与厦门的关系';
    $('#impactSummary').textContent = '来源未提供有效台风中心坐标，请直接核对官方渠道。';
    track('local_impact_rendered', { city_id: 'xiamen', result: 'unavailable' });
    return;
  }
  const closestText = impact.closest ? `；当前预测离散点中，最近约 ${Math.round(impact.closest.distance)} 公里` : '；来源暂未提供可用预测点';
  $('#impactTitle').textContent = `${storm.name}位于厦门${impact.bearing}方向`;
  $('#impactSummary').textContent = `台风中心距离厦门城市参考点约 ${Math.round(impact.currentDistance)} 公里，最近实况显示${impact.trend}${closestText}。这不是登陆或本地风险判断。`;
  $('#distanceValue').textContent = `约 ${Math.round(impact.currentDistance)} km`;
  $('#bearingValue').textContent = `${impact.bearing}方向`;
  $('#trendValue').textContent = impact.trend;
  $('#trendWindow').textContent = impact.trendWindow;
  $('#closestValue').textContent = impact.closest ? `约 ${Math.round(impact.closest.distance)} km` : '暂无预测';
  $('#closestTime').textContent = impact.closest ? `${formatTime(impact.closest.item.time)} · ${safe(storm.forecastAgency, '机构未知')}` : '来源暂未提供预测路径';
  $('#actionTitle').textContent = impact.trend === '正在接近' ? '持续关注路径变化' : '先核对本地官方信息';
  $('#actionList').replaceChildren(...[
    '查看厦门属地气象部门发布的信息',
    impact.trend === '正在接近' ? '台风正在接近城市参考点，留意后续预测调整' : '当前空间距离仍较远，不等同于本地安全结论',
    '台风活动期间谨慎前往开放海域和危险岸线'
  ].map((text) => { const li = document.createElement('li'); li.textContent = text; return li; }));
  track('local_impact_rendered', { city_id: 'xiamen', storm_id: storm.id, result: 'available' });
}

function renderOverview() {
  const point = storm.latest;
  $('#stormCode').textContent = `TY ${safe(storm.id, '—')}`;
  $('#stormName').textContent = safe(storm.name, '暂无活动台风');
  $('#stormEnglish').textContent = safe(storm.englishName, '');
  $('#strength').textContent = safe(point?.strength);
  $('#windLevel').textContent = safe(point?.windLevel, '—');
  $('#windSpeed').textContent = point?.windSpeed ? `${point.windSpeed} 米/秒` : '来源暂未提供风速';
  $('#pressure').textContent = safe(point?.pressure, '—');
  $('#movement').textContent = point ? `${safe(point.moveDirection, '方向未知')} · ${safe(point.moveSpeed, '—')} km/h` : '来源暂未提供';
  $('#observedAt').textContent = `实况时间 ${formatTime(point?.time)}`;
  $('#stormNarrative').textContent = point ? `${storm.name}当前中心位于北纬 ${point.latitude}°、东经 ${point.longitude}°，中心强度为${safe(point.strength)}。` : '来源暂未提供有效实况。';
  $('#detailLink').href = `typhoon.html?id=${encodeURIComponent(storm.id)}`;
  $('#agencyName').textContent = safe(storm.forecastAgency, '来源未标明');
  $('#sourceTimes').textContent = `实况 ${formatTime(point?.time)} · 抓取 ${formatTime(new Date(payload.fetchedAt))}`;
  $('#trackSummary').textContent = `${storm.name}实况路径与${safe(storm.forecastAgency, '来源机构')}预测路径。预测会随新资料调整，不用于导航。`;
}

function markerIcon(className, size) { return L.divIcon({ className, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }); }
function renderMap() {
  const observed = (storm.track || []).filter(pointOf);
  const latestDate = parseTime(storm.latest?.time);
  const forecasts = (storm.forecast || []).filter((item) => pointOf(item) && (!latestDate || parseTime(item.time) - latestDate <= selectedHours * 3600000));
  renderTimeline(observed, forecasts);
  if (!window.L) { showMapFallback('library_unavailable', true); return; }
  try {
    if (!map) {
      map = L.map('map', { scrollWheelZoom: false });
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 10, attribution: '&copy; OpenStreetMap contributors' });
      tiles.on('tileerror', () => showMapFallback('tile_unavailable'));
      tiles.addTo(map);
    }
    if (pathLayer) pathLayer.remove();
    pathLayer = L.layerGroup().addTo(map);
    const bounds = [];
    const obsLatLng = observed.map((p) => [p.latitude, p.longitude]);
    const forecastLatLng = forecasts.map((p) => [p.latitude, p.longitude]);
    if (obsLatLng.length > 1) L.polyline(obsLatLng, { color: '#087f78', weight: 4 }).addTo(pathLayer);
    if (forecastLatLng.length) L.polyline([[storm.latest.latitude, storm.latest.longitude], ...forecastLatLng], { color: '#d98918', weight: 4, dashArray: '10 8' }).addTo(pathLayer);
    observed.slice(-12).forEach((p) => { L.circleMarker([p.latitude, p.longitude], { radius: 4, color: '#fff', weight: 2, fillColor: '#087f78', fillOpacity: 1 }).bindPopup(`<b>实况 · ${formatTime(p.time)}</b><br>${safe(p.strength)} · ${safe(p.windLevel, '—')}级`).addTo(pathLayer); bounds.push([p.latitude, p.longitude]); });
    forecasts.forEach((p) => { L.circleMarker([p.latitude, p.longitude], { radius: 6, color: '#d98918', weight: 3, fillColor: '#fff', fillOpacity: 1 }).bindPopup(`<b>预测 · ${formatTime(p.time)}</b><br>${safe(storm.forecastAgency)} · ${safe(p.strength)}`).addTo(pathLayer); bounds.push([p.latitude, p.longitude]); });
    L.marker([XIAMEN.latitude, XIAMEN.longitude], { icon: markerIcon('city-marker', 16), title: '福建厦门城市参考点' }).bindPopup('<b>福建·厦门</b><br>城市参考点').addTo(pathLayer); bounds.push([XIAMEN.latitude, XIAMEN.longitude]);
    if (storm.latest) L.marker([storm.latest.latitude, storm.latest.longitude], { icon: markerIcon('storm-marker', 20), title: `${storm.name}当前位置，${formatTime(storm.latest.time)}` }).bindPopup(`<b>${storm.name}当前位置</b><br>${formatTime(storm.latest.time)}`).addTo(pathLayer);
    if (bounds.length) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 6 });
    setTimeout(() => map.invalidateSize(), 0);
  } catch { showMapFallback('render_error', true); }
}

function renderTimeline(observed, forecasts) {
  const points = [...observed.slice(-4).map((p) => ({ ...p, label: '实况' })), ...forecasts.map((p) => ({ ...p, label: '预测' }))];
  const fragment = document.createDocumentFragment();
  points.forEach((point) => {
    const li = document.createElement('li'); const time = document.createElement('time'); const type = document.createElement('b'); const text = document.createElement('span');
    time.textContent = formatTime(point.time); type.textContent = point.label; text.textContent = `${safe(point.strength)} · ${safe(point.windLevel, '—')}级 · ${point.longitude}°E, ${point.latitude}°N`;
    li.append(time, type, text); fragment.append(li);
  });
  $('#timeline').replaceChildren(fragment);
}

function renderFollow(impact) {
  const followed = new Set(readJson(STORAGE.followed, []));
  const button = $('#followButton'); button.disabled = false;
  const syncButton = () => { const active = followed.has(storm.id); button.textContent = active ? '已关注此台风 ✓' : '关注此台风'; button.classList.toggle('following', active); button.setAttribute('aria-pressed', String(active)); };
  syncButton();
  button.onclick = () => {
    const wasActive = followed.has(storm.id);
    wasActive ? followed.delete(storm.id) : followed.add(storm.id);
    const savedSuccessfully = writeJson(STORAGE.followed, [...followed]);
    if (!savedSuccessfully) {
      wasActive ? followed.add(storm.id) : followed.delete(storm.id);
      syncButton();
      $('#reminderStatus').classList.add('storage-warning');
      $('#reminderStatus').textContent = '当前浏览器禁止本地保存，关注状态未更改。你仍可正常查看台风信息。';
      return;
    }
    syncButton(); const active = followed.has(storm.id); $('#reminderStatus').classList.remove('storage-warning'); $('#reminderStatus').textContent = active ? '已保存在当前浏览器，下次打开时将检查变化。' : '已取消关注。'; track('follow_changed', { storm_id: storm.id, followed: active });
  };
  const saved = readJson(STORAGE.reminders, {});
  $('#reminderForm').elements.strength.checked = Boolean(saved.strength); $('#reminderForm').elements.distance.checked = Boolean(saved.distance); $('#reminderForm').elements.forecast.checked = Boolean(saved.forecast);
  $('#reminderForm').onsubmit = (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const values = { strength: form.has('strength'), distance: form.has('distance'), forecast: form.has('forecast') }; const savedSuccessfully = writeJson(STORAGE.reminders, values); $('#reminderStatus').classList.toggle('storage-warning', !savedSuccessfully); $('#reminderStatus').textContent = savedSuccessfully ? '提醒偏好已保存在当前浏览器。网页关闭后不会发送系统推送。' : '当前浏览器禁止本地保存，提醒偏好未保存。'; if (savedSuccessfully) track('reminder_preferences_saved', { storm_id: storm.id, enabled_count: Object.values(values).filter(Boolean).length }); };
  const snapshots = readJson(STORAGE.snapshots, {}); const previous = snapshots[storm.id]; const changes = [];
  if (previous && followed.has(storm.id)) { if (previous.strength !== storm.latest?.strength && saved.strength) changes.push(`强度由${previous.strength || '未知'}变为${storm.latest?.strength || '未知'}`); if (impact && saved.distance && Math.abs(previous.distance - impact.currentDistance) >= 50) changes.push(`与厦门距离变化约${Math.round(Math.abs(previous.distance - impact.currentDistance))}公里`); if (previous.forecastEnd !== storm.forecast?.at(-1)?.time && saved.forecast) changes.push('预测路径已更新'); }
  if (changes.length) $('#reminderStatus').textContent = `自上次查看后：${changes.join('；')}。`;
  snapshots[storm.id] = { strength: storm.latest?.strength, distance: impact?.currentDistance, forecastEnd: storm.forecast?.at(-1)?.time, viewedAt: new Date().toISOString() }; writeJson(STORAGE.snapshots, snapshots);
}

function sharePayload() {
  const detailUrl = new URL(`typhoon.html?id=${encodeURIComponent(storm.id)}&city=xiamen`, location.href).href;
  if (!currentImpact || currentHealth?.state === 'failed') return { title: `${storm.name}｜海风哨`, text: `当前数据不足，请通过官方渠道核验。来源实况：${formatTime(storm.latest?.time)}。`, url: detailUrl };
  const state = currentHealth?.state === 'delayed' ? '页面数据可能延迟。' : '';
  return {
    title: `台风${storm.name}｜海风哨`,
    text: `${state}台风${storm.name}，来源实况时间${formatTime(storm.latest?.time)}。台风中心位于厦门${currentImpact.bearing}方向，距厦门城市参考点约${Math.round(currentImpact.currentDistance)}公里。距离和方位为本站根据公开坐标计算，不是官方预警。`,
    url: detailUrl
  };
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const area = document.createElement('textarea'); area.value = value; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
  const copied = document.execCommand('copy'); area.remove(); if (!copied) throw new Error('copy failed');
}

async function shareCurrent() {
  const content = sharePayload();
  track('share_started', { storm_id: storm.id, share_method: navigator.share ? 'system' : 'copy' });
  try {
    if (navigator.share) { await navigator.share(content); $('#shareStatus').textContent = '已打开系统分享面板。'; track('share_completed', { storm_id: storm.id, share_method: 'system' }); return; }
    await copyText(`${content.text}\n${content.url}`); $('#shareStatus').textContent = '当前摘要和详情链接已复制。'; track('share_completed', { storm_id: storm.id, share_method: 'copy' });
  } catch (error) { if (error?.name === 'AbortError') { track('share_cancelled', { storm_id: storm.id, share_method: 'system' }); } else { $('#shareStatus').textContent = '分享未完成，请使用“复制详情链接”。'; track('share_failed', { storm_id: storm.id, share_method: navigator.share ? 'system' : 'copy', reason: 'client_error' }); } }
}

function render() {
  const health = freshness(); currentHealth = health; $('#dataStrip').className = `data-strip ${health.state}`; $('#dataHealth').textContent = health.label; $('#freshnessBadge').textContent = payload.mode === 'live' ? '活动台风实况' : '历史数据';
  renderOverview(); const impact = calculateImpact(); currentImpact = impact; renderImpact(impact); renderMap(); renderFollow(impact);
}

document.querySelectorAll('.time-tabs button').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.time-tabs button').forEach((item) => { item.classList.remove('active'); item.setAttribute('aria-pressed', 'false'); }); button.classList.add('active'); button.setAttribute('aria-pressed', 'true'); selectedHours = Number(button.dataset.hours); track('forecast_range_changed', { storm_id: storm?.id, forecast_hours: selectedHours }); renderMap(); }));
const dialog = $('#locationDialog'); const dialogButtons = [$('#locationButton'), $('#inlineLocation')]; dialogButtons.forEach((button) => button.addEventListener('click', () => { dialogOpener = button; dialogButtons.forEach((item) => item.setAttribute('aria-expanded', 'true')); dialog.showModal(); $('.dialog-close').focus(); })); $('.dialog-close').addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => { dialogButtons.forEach((item) => item.setAttribute('aria-expanded', 'false')); dialogOpener?.focus(); dialogOpener = null; }); $('.city-option').addEventListener('click', () => { writeJson(STORAGE.city, 'xiamen'); dialog.close(); });
$('.city-option').addEventListener('click', () => track('city_selected', { city_id: 'xiamen' }));
$('#sourceJump').addEventListener('click', () => { track('official_source_opened', { source: 'source_section' }); $('#sources').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
$('#shareSummary').addEventListener('click', shareCurrent);
$('#copyLink').addEventListener('click', async () => { track('share_started', { storm_id: storm.id, share_method: 'link_copy' }); try { await copyText(sharePayload().url); $('#shareStatus').textContent = '详情链接已复制，不包含精确位置。'; track('share_completed', { storm_id: storm.id, share_method: 'link_copy' }); } catch { $('#shareStatus').textContent = '复制失败，请从浏览器地址栏复制链接。'; track('share_failed', { storm_id: storm.id, share_method: 'link_copy', reason: 'client_error' }); } });
$('#detailLink').addEventListener('click', () => track('typhoon_detail_opened', { storm_id: storm?.id }));
document.querySelector('.timeline-panel').addEventListener('toggle', (event) => track('timeline_toggled', { storm_id: storm?.id, result: event.currentTarget.open ? 'opened' : 'closed' }));
document.querySelectorAll('.official-links a, .official-state a, #sourceLink').forEach((link) => link.addEventListener('click', () => track('official_source_opened', { source: link.hostname || 'official' })));
const trackSection = $('#track');
if ('IntersectionObserver' in window) { const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { track('track_opened', { storm_id: storm?.id }); observer.disconnect(); } }, { threshold: 0.35 }); observer.observe(trackSection); }

fetch(DATA_URL, { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }).then((data) => {
  if (!Array.isArray(data.storms) || !data.storms.length) throw new Error('当前数据中没有可展示的台风');
  payload = data; storm = data.storms.find((item) => item.active) || data.storms[0]; track('data_load_completed', { storm_id: storm.id, mode: data.mode || 'unknown', data_state: freshness().state, data_age_bucket: ageBucket(), using_cache: false }); render();
}).catch((error) => {
  track('data_load_failed', { reason: error instanceof TypeError ? 'network' : 'invalid_data' });
  $('#dataStrip').className = 'data-strip failed'; $('#dataHealth').textContent = '数据加载失败 · 请核对官方渠道'; $('#freshnessBadge').textContent = '当前状态未知';
  $('#impactTitle').textContent = '当前无法获取台风数据'; $('#impactSummary').textContent = '本站不会根据缺失数据判断风险，请直接查看官方来源。'; $('#actionList').innerHTML = '<li>重新加载页面</li><li>前往官方渠道核验</li>';
  showMapFallback('data_load_failed', true); track('fallback_displayed', { reason: 'data_load_failed' }); console.error(error);
});
