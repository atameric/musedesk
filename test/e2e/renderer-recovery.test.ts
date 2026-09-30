import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';

// Exercise React's actual recovery button and async boot/resume, without auth
// or touching user sessions. Uses the same optional Chrome as screenshot QA.
it('renderer shows disconnect, unlocks recovery of a stale turn, and reloads paged history', { timeout: 30000 }, async (t) => {
  const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chrome)) { t.skip('Chrome unavailable for renderer regression'); return; }
  const dir = mkdtempSync(path.join(tmpdir(), 'muse-renderer-recovery-'));
  try {
    await build({ root: path.resolve(__dirname, '../..'), logLevel: 'silent', build: { outDir: dir, emptyOutDir: false } });
    const mock = readFileSync(path.resolve(__dirname, '../../scripts/mock-bridge.cjs'), 'utf8').split('module.exports')[0];
    const scenario = `
      let state = 'ready', restarted = false;
      const bridge = buildMock({ pending: false });
      const status = { state, cliVersion: 'test', fingerprintMatch: true, cliArch: 'arm64', fullAccess: false };
      bridge.getStatus = async () => ({ ...status, state, error: state === 'error' ? 'test host stopped responding' : null });
      const oldResume = bridge.resumeSession;
      bridge.resumeSession = async (id) => {
        const value = await oldResume(id);
        value.session = { ...value.session, status: restarted ? 'idle' : 'running', activeTurnId: restarted ? null : 'stale-turn' };
        value.viewCursor = 'history-head';
        if (restarted) value.history = { mode: 'none', noneReason: 'projectionUnavailable', items: null, snapshot: null };
        return value;
      };
      bridge.restartHost = async () => { restarted = true; state = 'ready'; return bridge.getStatus(); };
      bridge.subscribeView = async () => ({ viewCursor: 'history-head' });
      bridge.pageView = async (id) => ({ events: historyItems().map((item, i) => ({
        method: 'item/completed', params: { sessionId: id, item, viewCursor: i ? 'history-head' : 'history-start' }
      })), nextCursor: null });
      window.musedesk = bridge;
      window.addEventListener('error', e => { document.body.dataset.scriptError = e.message; });
      setTimeout(() => { state = 'error'; }, 1000);
      setTimeout(() => {
        const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Restart host');
        const offline = document.querySelector('.pill')?.textContent.includes('disconnected');
        const noSpinner = !document.querySelector('.turn-status.running');
        const disabled = document.querySelector('textarea')?.disabled;
        document.body.dataset.offlineProof = String(offline && noSpinner && disabled && button && !button.disabled);
        button?.click();
      }, 4500);
      setTimeout(() => {
        const connected = document.querySelector('.pill')?.textContent.includes('connected') && !document.querySelector('.pill')?.textContent.includes('disconnected');
        const text = document.querySelector('.chat')?.textContent ?? '';
        const restored = text.includes('How do I speed up this test suite?') && text.includes('Shard across cores');
        document.body.dataset.recoveryProof = String(restarted && connected && restored && !document.querySelector('.turn-status.running') && !document.querySelector('.banner.warn'));
      }, 7500);
    `;
    const html = readFileSync(path.join(dir, 'index.html'), 'utf8').replaceAll('"/assets/', '"./assets/');
    const file = path.join(dir, 'recovery.html');
    writeFileSync(file, `<script>${mock}\n${scenario}</script>\n${html}`);
    const profile = path.join(dir, 'profile');
    const child = spawn(chrome, [
      '--headless', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files',
      '--no-first-run', '--no-default-browser-check', '--disable-component-update',
      `--user-data-dir=${profile}`, '--remote-debugging-port=0', `file://${file}`,
    ], { stdio: 'ignore' });
    let socket: WebSocket | null = null;
    try {
      const deadline = Date.now() + 18000;
      const pause = () => new Promise((resolve) => setTimeout(resolve, 100));
      const portFile = path.join(profile, 'DevToolsActivePort');
      while (!existsSync(portFile) && Date.now() < deadline) await pause();
      assert.ok(existsSync(portFile), 'Chrome debugging endpoint did not start');
      const port = readFileSync(portFile, 'utf8').split('\n')[0];
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find((tab: { url: string }) => tab.url === `file://${file}`);
      assert.ok(target, 'Recovery page did not open');
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => {
        socket!.onopen = () => resolve();
        socket!.onerror = () => reject(new Error('Chrome debugging connection failed'));
      });
      let sequence = 0;
      const pending = new Map<number, (value: string) => void>();
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data));
        if (message.id) {
          pending.get(message.id)?.(message.result?.result?.value ?? '');
          pending.delete(message.id);
        }
      };
      const bodyTag = () => new Promise<string>((resolve) => {
        const id = ++sequence;
        pending.set(id, resolve);
        socket!.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: {
          expression: 'document.body ? JSON.stringify(document.body.dataset) : ""', returnByValue: true,
        } }));
      });
      let proof: Record<string, string> = {};
      while (Date.now() < deadline) {
        proof = JSON.parse((await bodyTag()) || '{}');
        if (proof.recoveryProof !== undefined || proof.scriptError) break;
        await pause();
      }
      assert.equal(proof.offlineProof, 'true', JSON.stringify(proof));
      assert.equal(proof.recoveryProof, 'true', JSON.stringify(proof));
      assert.equal(proof.scriptError, undefined);
    } finally {
      socket?.close();
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
