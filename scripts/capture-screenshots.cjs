// Capture the README screenshots with headless Chrome against the canned
// mock bridge (no CLI, no auth, no real sessions). Usage:
//   npx vite build && node scripts/capture-screenshots.cjs
// or simply: npm run screenshots
// Set CHROME_BIN to override the browser path.
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const CHROME =
  process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SHOTS = [
  { name: 'chat', pending: false },
  { name: 'approval', pending: true },
];

function stageShotHtml(projectRoot, stageDir, pending) {
  const html = fs.readFileSync(path.join(projectRoot, 'dist', 'index.html'), 'utf8');
  const mockSrc = fs
    .readFileSync(path.join(projectRoot, 'scripts', 'mock-bridge.cjs'), 'utf8')
    .split('module.exports')[0];
  const mockTag =
    `<script>\n${mockSrc}\nwindow.musedesk = buildMock({ pending: ${pending} });\n</script>\n`;
  const staged = mockTag + html.split('"/assets/').join('"./assets/');
  const file = path.join(stageDir, pending ? 'shot-approval.html' : 'shot-chat.html');
  fs.writeFileSync(file, staged);
  return file;
}

function main() {
  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME} (set CHROME_BIN to override)`);
    process.exit(2);
  }
  const projectRoot = path.resolve(__dirname, '..');
  if (!fs.existsSync(path.join(projectRoot, 'dist', 'index.html'))) {
    console.error('dist/ is missing — run `npx vite build` first (or `npm run screenshots`)');
    process.exit(2);
  }
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musedesk-shot-'));
  try {
    fs.cpSync(path.join(projectRoot, 'dist', 'assets'), path.join(stageDir, 'assets'), {
      recursive: true,
    });
    const outDir = path.join(projectRoot, 'docs', 'screenshots');
    fs.mkdirSync(outDir, { recursive: true });
    for (const shot of SHOTS) {
      const htmlFile = stageShotHtml(projectRoot, stageDir, shot.pending);
      const outPath = path.join(outDir, `${shot.name}.png`);
      execFileSync(
        CHROME,
        [
          '--headless',
          // Only local file:// content is ever loaded; disabling Chrome's own
          // sandbox keeps this working in sandboxed shells and CI containers
          // where its sandbox init fails.
          '--no-sandbox',
          '--disable-gpu',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          '--window-size=1440,900',
          '--allow-file-access-from-files',
          '--virtual-time-budget=8000',
          `--screenshot=${outPath}`,
          `file://${htmlFile}`,
        ],
        { stdio: 'inherit', timeout: 60000 },
      );
      console.log(`wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
    }
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

main();
