import { spawn } from 'node:child_process';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9338;
const profile = new URL('../.accessibility-cdp', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
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
async function target() { const { targetId } = await call('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true }); await call('Page.enable', {}, sessionId); return { targetId, sessionId }; }
async function evaluate(sessionId, expression) { const { result } = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); return result.value; }

try {
  const main = await target();
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 }, main.sessionId);
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, main.sessionId);
  await call('Page.navigate', { url: 'http://127.0.0.1:4173/' }, main.sessionId);
  await pause(2500);
  const structure = await evaluate(main.sessionId, `(async () => {
    const visible = (node) => { const style=getComputedStyle(node), rect=node.getBoundingClientRect(); return style.display!=='none' && style.visibility!=='hidden' && rect.width>0 && rect.height>0; };
    const accessibleName = (node) => node.getAttribute('aria-label') || node.textContent || node.getAttribute('title') || [...(node.labels||[])].map(label=>label.textContent).join(' ') || node.name || '';
    const unnamed=[...document.querySelectorAll('a,button,input,summary,[tabindex]')].filter(visible).filter(node=>!accessibleName(node).trim()).map(node=>node.outerHTML.slice(0,120));
    document.querySelector('.skip-link').focus(); const skipFocused=document.activeElement.classList.contains('skip-link');
    document.querySelector('#locationButton').click(); const dialogFocused=document.activeElement.classList.contains('dialog-close'); document.querySelector('.dialog-close').click(); await new Promise(resolve=>setTimeout(resolve,0)); const focusReturned=document.activeElement.id==='locationButton';
    return { unnamed, skipFocused, dialogFocused, focusReturned, reducedMotion:getComputedStyle(document.documentElement).scrollBehavior==='auto', tabs:[...document.querySelectorAll('.time-tabs button')].map(x=>x.getAttribute('aria-pressed')), mapDescription:document.querySelector('#map').getAttribute('aria-describedby'), overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth };
  })()`);
  await call('Emulation.setPageScaleFactor', { pageScaleFactor: 2 }, main.sessionId);
  const zoom = await evaluate(main.sessionId, `({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth, activeTag:document.activeElement.tagName})`);

  const storage = await target();
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError')}` }, storage.sessionId);
  await call('Page.navigate', { url: 'http://127.0.0.1:4173/' }, storage.sessionId);
  await pause(2500);
  const storageFallback = await evaluate(storage.sessionId, `(() => { document.querySelector('#followButton').click(); return document.querySelector('#reminderStatus').textContent; })()`);

  const network = await target();
  await call('Network.enable', {}, network.sessionId);
  await call('Network.setBlockedURLs', { urls: ['*unpkg.com/leaflet*'] }, network.sessionId);
  await call('Page.navigate', { url: 'http://127.0.0.1:4173/' }, network.sessionId);
  await pause(2500);
  const mapFallback = await evaluate(network.sessionId, `({shown:!document.querySelector('#mapFallback').hidden,text:document.querySelector('#mapFallback').textContent.trim(),timeline:Boolean(document.querySelector('#timeline li'))})`);

  const result = { structure, zoom200: zoom, storageFallback, mapFallback };
  console.log(JSON.stringify(result, null, 2));
  const passed = structure.unnamed.length === 0 && structure.skipFocused && structure.dialogFocused && structure.focusReturned && structure.reducedMotion && structure.tabs.join(',') === 'false,false,true' && structure.mapDescription === 'mapDescription' && !structure.overflow && !zoom.overflow && storageFallback.includes('禁止本地保存') && mapFallback.shown && mapFallback.timeline;
  if (!passed) process.exitCode = 1;
} finally {
  await call('Browser.close').catch(() => {}); socket.close(); browser.kill();
}
