'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const pause = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
async function openBrowser(file, profile, width = 1440, height = 900) {
  const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const child = spawn(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check', '--disable-component-update', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${width},${height}`, `--user-data-dir=${profile}`, '--remote-debugging-port=0', `file://${file}`], { stdio: 'ignore' });
  let socket;
  const pending = new Map();
  async function close() {
    socket?.close();
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Browser closed')); }
    pending.clear();
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    await new Promise(resolve => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
  }
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const deadline = Date.now() + 15000;
    while (!fs.existsSync(portFile) && Date.now() < deadline) await pause();
    if (!fs.existsSync(portFile)) throw new Error('Chrome debugging endpoint did not start');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find(tab => tab.url === `file://${file}`);
    if (!target) throw new Error('QA page missing');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('CDP connection failed')); });
    let sequence = 0;
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data));
      const entry = pending.get(message.id); if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
    };
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
      return result.result.value;
    };
    const waitFor = async (expression, timeout = 8000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expression)) return; await pause(); } throw new Error('UI wait timed out: ' + expression); };
    const resize = async (width, height) => { await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(100); };
    const screenshot = async output => { const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(output, Buffer.from(r.data, 'base64')); };
    await resize(width, height);
    return { call, evaluate, waitFor, resize, screenshot, close };
  } catch (e) { await close(); throw e; }
}
module.exports = { openBrowser, pause };
