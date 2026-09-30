// Local canned renderer QA; never loads a real CLI or credentials.
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { openBrowser } = require('./browser-qa.cjs');
async function main() {
  const root = path.resolve(__dirname, '..');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'musedesk-shot-'));
  let browser;
  try {
    fs.cpSync(path.join(root, 'dist/assets'), path.join(stage, 'assets'), { recursive: true });
    const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').replaceAll('"/assets/', '"./assets/');
    const mock = fs.readFileSync(path.join(root, 'scripts/mock-bridge.cjs'), 'utf8').split('module.exports')[0];
    const out = path.join(root, 'docs/screenshots'); fs.mkdirSync(out, { recursive: true });
    for (const pending of [false, true]) {
      const file = path.join(stage, `shot-${pending}.html`);
      fs.writeFileSync(file, `<script>${mock}\nlocalStorage.clear();localStorage.setItem('musedesk.effort','max');localStorage.setItem('musedesk.projects',JSON.stringify({folders:[],hidden:[],collapsed:{'/Users/demo/defence-platform':true,'/Users/demo/level-editor':true}}));window.musedesk=buildMock({pending:${pending},polished:true});</script>${html}`);
      browser = await openBrowser(file, path.join(stage, 'profile-' + pending));
      await browser.waitFor("document.querySelector('.ctx')?.textContent.includes('26%')");
      await browser.screenshot(path.join(out, pending ? 'approval.png' : 'chat.png'));
      if (!pending) {
        for (const [width, height] of [[960,640],[1280,800],[1920,1080]]) {
          await browser.resize(width,height); await browser.screenshot(path.join(out, `chat-${width}.png`));
        }
        await browser.resize(1440,900);
        await browser.evaluate("document.querySelector('[aria-label=Changes]').click()");
        await browser.waitFor("!!document.querySelector('.change-row')");
        await browser.evaluate("document.querySelector('.change-row').click()");
        await browser.waitFor("!!document.querySelector('.diff')");
        await browser.screenshot(path.join(out, 'changes.png'));
        await browser.evaluate("document.querySelector('[aria-label=\"Close inspector\"]').click();document.querySelector('.side-footer .side-nav-item').click()");
        await browser.waitFor("!!document.querySelector('.dialog')");
        await browser.screenshot(path.join(out, 'settings.png'));
        await browser.evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click();document.querySelector('[aria-label=Tasks]').click()");
        await browser.waitFor("!!document.querySelector('.task-row')");
        await browser.screenshot(path.join(out,'tasks.png'));
        await browser.evaluate("document.querySelector('[aria-label=\"Close inspector\"]').click();document.querySelector('.side-nav-item').click()");
        await browser.waitFor("!!document.querySelector('.overview')");
        await browser.screenshot(path.join(out,'overview.png'));
        await browser.evaluate("document.querySelector('.ov-head .btn').click()");
        await browser.waitFor("!!document.querySelector('[aria-label=\"Open command palette\"]')");
        await browser.evaluate("document.querySelector('[aria-label=\"Open command palette\"]').click()");
        await browser.waitFor("document.activeElement?.classList.contains('palette-input')");
        await browser.screenshot(path.join(out,'palette.png'));
        await browser.evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click();document.querySelector('[aria-label=\"More actions\"]').click()");
        await browser.waitFor("!!document.querySelector('.popup-menu')");
        await browser.screenshot(path.join(out,'menu.png'));
      }
      await browser.close(); browser = null;
    }
    console.log('Screenshots saved to docs/screenshots.');
  } finally { await browser?.close(); fs.rmSync(stage, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode=1; });
