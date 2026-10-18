import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const API = 'https://typhoon.slt.zj.gov.cn/Api';
const SOURCE_URL = 'https://typhoon.slt.zj.gov.cn/';
const OUTPUT = resolve('dist/data/typhoon.json');
const headers = { accept: 'application/json', referer: SOURCE_URL, 'user-agent': 'coastal-typhoon-watch/1.0 (+https://github.com/scott33333345-hue/coastal-typhoon-watch)' };

function shanghaiYear() {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Asia/Shanghai' }).format(new Date());
}

async function getJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1500));
    }
  }
  throw new Error(`请求失败：${url}；${lastError?.message || lastError}`);
}

function numberOrNull(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizePoint(point, type) {
  return {
    type, time: point.time || null,
    longitude: numberOrNull(point.lng), latitude: numberOrNull(point.lat),
    strength: String(point.strong || '').trim() || null,
    windLevel: numberOrNull(point.power), windSpeed: numberOrNull(point.speed),
    pressure: numberOrNull(point.pressure), moveSpeed: numberOrNull(point.movespeed),
    moveDirection: String(point.movedirection || '').trim() || null,
    radius7: String(point.radius7 || '').trim() || null,
    radius10: String(point.radius10 || '').trim() || null,
    radius12: String(point.radius12 || '').trim() || null
  };
}

function normalizeStorm(summary, detail) {
  const observations = Array.isArray(detail.points) ? detail.points : [];
  const latestRaw = observations.at(-1) || null;
  const latest = latestRaw ? normalizePoint(latestRaw, 'observed') : null;
  const agencies = Array.isArray(latestRaw?.forecast) ? latestRaw.forecast : [];
  const preferred = agencies.find((item) => item.tm === '中国') || agencies[0];
  const forecast = (preferred?.forecastpoints || []).filter((point) => point.time !== latestRaw?.time).map((point) => normalizePoint(point, 'forecast')).filter((point) => point.latitude !== null && point.longitude !== null);
  const track = observations.map((point) => normalizePoint(point, 'observed')).filter((point) => point.latitude !== null && point.longitude !== null);
  return {
    id: String(detail.tfid || summary.tfid), name: detail.name || summary.name || '未命名',
    englishName: detail.enname || summary.enname || 'NAMELESS',
    active: String(detail.isactive ?? summary.isactive) === '1',
    startTime: detail.starttime || summary.starttime || null, endTime: detail.endtime || summary.endtime || null,
    warningLevel: String(detail.warnlevel || summary.warnlevel || '').trim().toLowerCase() || null,
    forecastAgency: preferred?.tm || null, latest, track, forecast
  };
}

async function main() {
  const year = shanghaiYear();
  const list = await getJson(`${API}/TyphoonList/${year}`);
  if (!Array.isArray(list)) throw new Error('年度台风列表格式异常');
  const activeSummaries = list.filter((storm) => String(storm.isactive) === '1');
  const candidates = activeSummaries.length ? activeSummaries : list.slice(-1);
  const storms = [];
  for (const summary of candidates) storms.push(normalizeStorm(summary, await getJson(`${API}/TyphoonInfo/${summary.tfid}`)));
  const activeStorms = storms.filter((storm) => storm.active);
  const payload = {
    schemaVersion: 1,
    source: { name: '浙江省水利厅台风路径实时发布系统', url: SOURCE_URL, listEndpoint: `${API}/TyphoonList/${year}` },
    fetchedAt: new Date().toISOString(), year: Number(year), activeCount: activeStorms.length,
    mode: activeStorms.length ? 'live' : 'latest-inactive', storms: activeStorms.length ? activeStorms : storms,
    notice: activeStorms.length ? '当前展示活动台风。请以当地气象台和政府发布的信息为准。' : '来源系统当前无活动台风，页面展示最近一次已停编台风供回顾。'
  };
  let previous = '';
  try { previous = await readFile(OUTPUT, 'utf8'); } catch {}
  let dataChanged = true;
  let dataChangedAt = payload.fetchedAt;
  if (previous) {
    try {
      const oldPayload = JSON.parse(previous);
      const stable = ({ fetchedAt, dataChangedAt: ignoredChangedAt, ...value }) => value;
      dataChanged = JSON.stringify(stable(oldPayload)) !== JSON.stringify(stable(payload));
      dataChangedAt = dataChanged ? payload.fetchedAt : (oldPayload.dataChangedAt || oldPayload.fetchedAt || payload.fetchedAt);
    } catch {}
  }
  payload.dataChangedAt = dataChangedAt;
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `data_changed=${dataChanged}\n`, 'utf8');
  console.log(`已写入 ${OUTPUT}：${payload.activeCount} 个活动台风，模式 ${payload.mode}，数据${dataChanged ? '已变化' : '无变化'}。`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

