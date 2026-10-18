const $ = (selector) => document.querySelector(selector);
const id = new URLSearchParams(location.search).get('id');
const track = (name, properties = {}) => window.coastalAnalytics?.track(name, properties);
let offlineCache = false;

const fmt = (value) => {
  if (!value) return '时间未知';
  const date = new Date(value.replace(' ', 'T') + (value.includes('T') ? '' : '+08:00'));
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
};

function chart(svg, values, color, unit) {
  const available = values.filter((item) => Number.isFinite(item.value));
  if (available.length < 2) { svg.setAttribute('aria-label', '来源数据不足，无法绘制趋势'); svg.innerHTML = '<text x="20" y="40">来源数据不足，无法绘制趋势</text>'; return; }
  const min = Math.min(...available.map((item) => item.value)); const max = Math.max(...available.map((item) => item.value)); const span = max - min || 1;
  const points = available.map((item, index) => `${35 + index * 630 / (available.length - 1)},${185 - (item.value - min) / span * 145}`).join(' ');
  svg.setAttribute('aria-label', `${fmt(available[0].time)}至${fmt(available.at(-1).time)}，最低${min}${unit}，最高${max}${unit}`);
  svg.innerHTML = `<line x1="35" y1="185" x2="665" y2="185" stroke="#bed0cc"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="4"/><text x="35" y="210" font-size="12">${fmt(available[0].time)}</text><text x="540" y="210" font-size="12">${fmt(available.at(-1).time)}</text><text x="38" y="28" font-size="13">${max} ${unit}</text><text x="38" y="180" font-size="13">${min} ${unit}</text>`;
}

function life(history) {
  const events = []; let last;
  history.forEach((point) => { if (point.strength && point.strength !== last) { events.push({ time: point.time, text: `强度变为${point.strength}（${point.windLevel ?? '—'}级）` }); last = point.strength; } });
  const fragment = document.createDocumentFragment();
  events.forEach((event) => { const item = document.createElement('li'); item.innerHTML = `<time>${fmt(event.time)}</time><strong>${event.text}</strong>`; fragment.append(item); });
  $('#lifecycle').replaceChildren(fragment);
}

function renderDetail(data) {
  const storm = data.storms?.find((item) => !id || item.id === id);
  if (!storm) throw new Error('未找到该台风');
  const point = storm.latest;
  track('data_load_completed', { page: 'detail', storm_id: storm.id, mode: data.mode || 'unknown', using_cache: offlineCache });
  document.title = `${storm.name}详情｜海风哨`;
  $('#detailHealth').classList.toggle('delayed', offlineCache || !navigator.onLine);
  $('#detailHealth').textContent = offlineCache || !navigator.onLine ? `当前离线 · 缓存实况 ${fmt(point?.time)} · 抓取 ${fmt(data.fetchedAt)}` : `来源实况 ${fmt(point?.time)} · 页面数据抓取 ${fmt(data.fetchedAt)}`;
  $('#detailCode').textContent = `TY ${storm.id}`; $('#detailName').textContent = storm.name; $('#detailEnglish').textContent = storm.englishName || ''; $('#detailStatus').textContent = storm.active ? '活动中' : '已停止编号';
  $('#detailSummary').textContent = `${storm.name}共有 ${storm.track?.length || 0} 个实况节点和 ${storm.forecast?.length || 0} 个${storm.forecastAgency || '来源机构'}预测节点。`;
  $('#dStrength').textContent = point?.strength || '来源未提供'; $('#dWind').textContent = point?.windLevel ? `${point.windLevel}级 · ${point.windSpeed}m/s` : '来源未提供'; $('#dPressure').textContent = point?.pressure ? `${point.pressure} hPa` : '来源未提供'; $('#dMove').textContent = `${point?.moveDirection || '方向未知'} · ${point?.moveSpeed ?? '—'}km/h`;
  $('#compareLink').href = `compare.html?current=${encodeURIComponent(storm.id)}`; $('#compareLink').addEventListener('click', () => track('historical_compare_opened', { storm_id: storm.id }));
  life(storm.track || []); chart($('#windChart'), (storm.track || []).map((item) => ({ time: item.time, value: item.windSpeed })), '#087f78', 'm/s'); chart($('#pressureChart'), (storm.track || []).map((item) => ({ time: item.time, value: item.pressure })), '#d98918', 'hPa');
  const rows = document.createDocumentFragment();
  (storm.track || []).forEach((item) => { const row = document.createElement('tr'); row.innerHTML = `<td>${fmt(item.time)}</td><td>${item.strength || '—'}</td><td>${item.windLevel ?? '—'}级</td><td>${item.windSpeed ?? '—'}m/s</td><td>${item.pressure ?? '—'}hPa</td><td>${item.longitude}°E, ${item.latitude}°N</td>`; rows.append(row); });
  $('#detailTable').replaceChildren(rows);
}

fetch('data/typhoon.json', { cache: 'no-store' })
  .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); offlineCache = response.headers.get('X-Coastal-Offline') === 'true'; return response.json(); })
  .then(renderDetail)
  .catch((error) => { track('data_load_failed', { page: 'detail', reason: error instanceof TypeError ? 'network' : 'invalid_data' }); $('#detailHealth').textContent = '详情数据加载失败'; $('#detailName').textContent = '无法显示台风详情'; $('#detailSummary').textContent = `${error.message}。请返回首页或查看官方来源。`; });
