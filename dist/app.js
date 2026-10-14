const $ = (selector) => document.querySelector(selector);
const DATA_URL = 'data/typhoon.json';
let payload;
let selectedStorm;
let selectedHours = 72;

function safe(value, fallback = '—') { return value === null || value === undefined || value === '' ? fallback : value; }
function parseSourceTime(value) { return value ? new Date(value.replace(' ', 'T') + '+08:00') : null; }
function formatSourceTime(value) {
  const date = parseSourceTime(value);
  if (!date || Number.isNaN(date.getTime())) return safe(value);
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
function formatFetchTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
}
function warningMeta(level) {
  return ({ blue: ['蓝色预警', 'Ⅳ级 · 一般'], yellow: ['黄色预警', 'Ⅲ级 · 较重'], orange: ['橙色预警', 'Ⅱ级 · 严重'], red: ['红色预警', 'Ⅰ级 · 特别严重'], white: ['白色提醒', '关注台风动态'] })[level] || ['未见预警级别', '请查询属地官方渠道'];
}
function project(point) {
  const longitude = Math.max(100, Math.min(180, point.longitude));
  const latitude = Math.max(0, Math.min(50, point.latitude));
  return { x: ((longitude - 100) / 80) * 1000, y: ((50 - latitude) / 50) * 520 };
}
function svgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}
function pathFrom(points) { return points.map((point, index) => { const { x, y } = project(point); return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' '); }

function renderMap() {
  const group = $('#dynamicTrack');
  group.replaceChildren();
  if (!selectedStorm?.latest) return;
  const observed = selectedStorm.track || [];
  const latestDate = parseSourceTime(selectedStorm.latest.time);
  const forecast = (selectedStorm.forecast || []).filter((point) => {
    const date = parseSourceTime(point.time);
    return !latestDate || !date || date - latestDate <= selectedHours * 3_600_000;
  });
  if (observed.length > 1) group.append(svgElement('path', { d: pathFrom(observed), class: 'track-history' }));
  if (forecast.length) group.append(svgElement('path', { d: pathFrom([selectedStorm.latest, ...forecast]), class: 'track-forecast' }));
  observed.slice(-18).forEach((point) => { const { x, y } = project(point); group.append(svgElement('circle', { cx: x, cy: y, r: 5, class: 'dynamic-observed' })); });
  forecast.forEach((point) => {
    const { x, y } = project(point);
    group.append(svgElement('circle', { cx: x, cy: y, r: 7, class: 'dynamic-forecast' }));
    const label = svgElement('text', { x: x + 10, y: y - 10, class: 'dynamic-label' });
    label.textContent = formatSourceTime(point.time);
    group.append(label);
  });
  const current = project(selectedStorm.latest);
  const label = svgElement('text', { x: current.x + 18, y: current.y + 4, class: 'dynamic-current-label' });
  label.textContent = `${selectedStorm.name} ${safe(selectedStorm.latest.windLevel)}级`;
  group.append(svgElement('circle', { cx: current.x, cy: current.y, r: 28, class: 'dynamic-current-halo' }), svgElement('circle', { cx: current.x, cy: current.y, r: 12, class: 'dynamic-current' }), label);
}

function render() {
  const storm = selectedStorm;
  const point = storm?.latest;
  const live = payload.mode === 'live' && storm?.active;
  $('#stormStatus').textContent = live ? '活动台风实况' : '当前无活动台风 · 最近一次路径回顾';
  $('#dataTime').textContent = `数据时间 ${formatSourceTime(point?.time)}`;
  $('#stormCode').textContent = `TY ${safe(storm?.id)}`;
  $('#stormName').innerHTML = `${safe(storm?.name, '暂无台风')}<span>${safe(storm?.englishName)}</span>`;
  $('#stormSummary').innerHTML = point ? `中心位于北纬 <strong>${point.latitude}</strong>°、东经 <strong>${point.longitude}</strong>°，<br>以每小时 <strong>${safe(point.moveSpeed)}</strong> 公里向${safe(point.moveDirection, '未知方向')}移动。` : '来源系统暂未提供有效台风中心数据。';
  $('#fetchTime').textContent = `${formatFetchTime(payload.fetchedAt)} 抓取`;
  $('#sourceUpdate').textContent = `抓取时间 ${formatFetchTime(payload.fetchedAt)}`;
  $('#windLevel').textContent = safe(point?.windLevel);
  $('#windSpeed').textContent = `${safe(point?.windSpeed)} 米/秒 · ${safe(point?.strength)}`;
  $('#pressure').textContent = safe(point?.pressure);
  $('#moveDirection').textContent = safe(point?.moveDirection);
  $('#moveSpeed').textContent = `${safe(point?.moveSpeed)} 公里/时`;
  $('#latitude').textContent = safe(point?.latitude);
  $('#longitude').textContent = `${safe(point?.longitude)} °E`;
  $('#mapStatus').textContent = live ? `正在显示 ${storm.name} 实况与中国预报路径` : `无活动台风，显示 ${storm?.name || '最近台风'} 已停编路径`;
  const age = Date.now() - new Date(payload.fetchedAt).getTime();
  const stale = !Number.isFinite(age) || age > 45 * 60_000;
  $('#freshnessBadge').textContent = stale ? '数据可能延迟' : '数据已同步';
  $('#freshnessBadge').classList.toggle('stale', stale);
  $('#dataBanner').classList.toggle('stale', stale);
  const [warningTitle, severity] = warningMeta(storm?.warningLevel);
  $('#heroWarning').textContent = live ? warningTitle : '当前无活动台风';
  $('#heroWarningLevel').textContent = live ? severity : '最近台风已停止编号';
  $('#warningTitle').textContent = live ? warningTitle : '当前无活动台风';
  $('#warningSeverity').textContent = live ? severity : '来源系统未显示活动台风';
  $('#warningTime').textContent = formatSourceTime(point?.time);
  $('#warningCopy').textContent = live ? `来源系统对台风“${storm.name}”标记为“${warningTitle}”。这不是本站发布的属地预警，请继续核对当地气象台正式信息。` : `浙江省水利厅台风路径系统当前未显示活动台风。页面保留“${storm?.name || '最近台风'}”路径供回顾，请勿视为当前实况。`;
  $('#warningCard').className = `warning-card ${live ? (storm.warningLevel || 'none') : 'none'}`;
  renderMap();
}

document.querySelectorAll('.time-tabs button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.time-tabs button').forEach((tab) => tab.classList.remove('active'));
  button.classList.add('active'); selectedHours = Number(button.dataset.hours); renderMap();
}));
const dialog = $('#warningDialog');
$('#warningDetail').addEventListener('click', () => dialog.showModal());
$('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
const sections = [...document.querySelectorAll('main section[id]')];
const navLinks = [...document.querySelectorAll('nav a')];
const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible) navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
}, { threshold: [0.25, 0.55] });
sections.forEach((section) => observer.observe(section));

fetch(DATA_URL, { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }).then((data) => {
  payload = data; selectedStorm = data.storms?.[0]; render();
}).catch((error) => {
  $('#stormStatus').textContent = '数据暂时无法载入';
  $('#stormSummary').textContent = '请直接访问浙江省水利厅台风路径系统核对最新信息。';
  $('#freshnessBadge').textContent = '加载失败'; $('#dataBanner').classList.add('stale');
  console.error('台风数据加载失败', error);
});

