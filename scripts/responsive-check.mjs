import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const root = path.resolve(import.meta.dirname, '..');
const port = 9337;
const profile = path.join(root, '.responsive-cdp');
const output = path.join(root, 'docs', 'product', 'responsive');
await mkdir(output, { recursive: true });
const browser = spawn(edge, ['--headless', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function browserSocket() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch {}
    await pause(250);
  }
  throw new Error('Edge DevTools endpoint did not start');
}

let nextId = 0;
const pending = new Map();
const socket = new WebSocket(await browserSocket());
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
socket.addEventListener('message', ({ data }) => { const message = JSON.parse(data); if (!message.id || !pending.has(message.id)) return; const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); });
function call(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }

const cases = [
  ['home-360', 360, 800, 'http://127.0.0.1:4173/'],
  ['home-390', 390, 844, 'http://127.0.0.1:4173/'],
  ['home-768', 768, 1024, 'http://127.0.0.1:4173/'],
  ['home-1440', 1440, 1000, 'http://127.0.0.1:4173/'],
  ['detail-390', 390, 844, 'http://127.0.0.1:4173/typhoon.html?id=202630'],
  ['compare-390', 390, 844, 'http://127.0.0.1:4173/compare.html']
];

try {
  for (const [name, width, height, url] of cases) {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600, screenWidth: width, screenHeight: height }, sessionId);
    await call('Page.enable', {}, sessionId);
    await call('Page.navigate', { url }, sessionId);
    await pause(2500);
    const { result } = await call('Runtime.evaluate', { expression: '({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,ready:document.readyState})', returnByValue: true }, sessionId);
    const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true }, sessionId);
    await writeFile(path.join(output, `${name}.png`), Buffer.from(data, 'base64'));
    console.log(JSON.stringify({ name, width, height, ...result.value, overflow: result.value.scrollWidth > result.value.clientWidth }));
    await call('Target.closeTarget', { targetId });
  }
} finally {
  await call('Browser.close').catch(() => {}); socket.close(); browser.kill();
}
