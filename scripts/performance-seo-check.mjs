import { spawn } from 'node:child_process';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9339;
const profile = new URL('../.quality-cdp', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const browser = spawn(edge, ['--headless', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function browserSocket() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) return (await response.json()).webSocketDebuggerUrl; } catch {}
    await pause(250);
  }
  throw new Error('Edge DevTools endpoint did not start');
}

let nextId = 0;
const pending = new Map();
const socket = new WebSocket(await browserSocket());
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
socket.addEventListener('message', ({ data }) => { const message = JSON.parse(data); if (!message.id || !pending.has(message.id)) return; const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); });
function call(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
async function evaluate(sessionId, expression) { const { result } = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); return result.value; }

try {
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Page.enable', {}, sessionId); await call('Network.enable', {}, sessionId);
  await call('Page.navigate', { url: 'http://127.0.0.1:4173/' }, sessionId); await pause(3000);

  const online = await evaluate(sessionId, `(() => {
    const nav=performance.getEntriesByType('navigation')[0]; const paint=performance.getEntriesByName('first-contentful-paint')[0];
    const resources=performance.getEntriesByType('resource'); const dcl=nav?.domContentLoadedEventEnd||0;
    return {title:document.title,h1:document.querySelectorAll('h1').length,canonical:document.querySelector('link[rel=canonical]')?.href,description:document.querySelector('meta[name=description]')?.content,ogTitle:document.querySelector('meta[property="og:title"]')?.content,jsonLd:Boolean(document.querySelector('script[type="application/ld+json"]')),manifest:document.querySelector('link[rel=manifest]')?.href,domContentLoadedMs:Math.round(dcl),loadMs:Math.round(nav?.loadEventEnd||0),fcpMs:Math.round(paint?.startTime||0),resourceCount:resources.length,transferBytes:resources.reduce((sum,item)=>sum+(item.transferSize||0),0),leafletStartedAfterDcl:resources.filter(item=>item.name.includes('leaflet')).every(item=>item.startTime>=dcl),consoleErrors:window.__qualityErrors||0};
  })()`);

  const pages = {};
  for (const page of ['typhoon.html', 'compare.html']) {
    await call('Page.navigate', { url: `http://127.0.0.1:4173/${page}` }, sessionId); await pause(1500);
    pages[page] = await evaluate(sessionId, `({title:document.title,h1:document.querySelectorAll('h1').length,canonical:document.querySelector('link[rel=canonical]')?.href,description:document.querySelector('meta[name=description]')?.content,ogTitle:document.querySelector('meta[property="og:title"]')?.content,manifest:Boolean(document.querySelector('link[rel=manifest]'))})`);
  }

  await call('Page.navigate', { url: 'http://127.0.0.1:4173/' }, sessionId); await pause(1500);
  const serviceWorker = await evaluate(sessionId, `Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),5000))])`);
  await call('Page.reload', { ignoreCache: true }, sessionId); await pause(1800);
  let controlled = await evaluate(sessionId, `Boolean(navigator.serviceWorker.controller)`);
  if (!controlled) { await call('Page.reload', { ignoreCache: true }, sessionId); await pause(1800); controlled = await evaluate(sessionId, `Boolean(navigator.serviceWorker.controller)`); }
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, sessionId);
  await call('Page.reload', {}, sessionId).catch(() => {}); await pause(2200);
  const offline = await evaluate(sessionId, `({loaded:document.readyState==='complete',status:document.querySelector('#dataHealth')?.textContent||'',h1:document.querySelector('h1')?.textContent||'',controller:Boolean(navigator.serviceWorker.controller)})`).catch(() => ({ loaded: false, status: '', h1: '', controller: false }));
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);

  const endpoints = {};
  for (const file of ['robots.txt', 'sitemap.xml', 'manifest.webmanifest', 'sw.js']) { const response = await fetch(`http://127.0.0.1:4173/${file}`); endpoints[file] = response.status; }
  const result = { online, pages, serviceWorker, controlled, offline, endpoints };
  console.log(JSON.stringify(result, null, 2));
  const pageChecks = Object.values(pages).every((page) => page.title && page.h1 === 1 && page.canonical && page.description && page.ogTitle && page.manifest);
  const passed = online.h1 === 1 && online.canonical && online.description && online.ogTitle && online.jsonLd && online.manifest && online.leafletStartedAfterDcl && pageChecks && serviceWorker && controlled && offline.loaded && offline.status.includes('离线') && offline.controller && Object.values(endpoints).every((status) => status === 200);
  if (!passed) process.exitCode = 1;
} finally {
  await call('Browser.close').catch(() => {}); socket.close(); browser.kill();
}
