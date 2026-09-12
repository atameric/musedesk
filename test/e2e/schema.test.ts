import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverMusePath } from '../../src/msp/discovery';

// Protocol regression gate (plan §Validation): the `msp.d.ts` vendored in
// the repo must be byte-identical to what the local `muse` binary exports.
// Offline, instant, needs no auth — runs everywhere the CLI is installed.
describe('MSP schema drift', () => {
  it('vendored msp.d.ts matches `muse schema generate-ts`', (t) => {
    let binPath: string;
    try {
      binPath = discoverMusePath();
    } catch {
      console.log('SKIP schema: muse CLI not on PATH');
      t.skip('muse CLI not on PATH');
      return;
    }
    const dir = mkdtempSync(path.join(tmpdir(), 'muse-schema-'));
    try {
      const r = spawnSync(binPath, ['schema', 'generate-ts', '--out', dir], {
        encoding: 'utf8',
        timeout: 30000,
      });
      assert.equal(r.status, 0, `schema export failed: ${(r.stderr || '').slice(0, 300)}`);
      const fresh = readFileSync(path.join(dir, 'msp.d.ts'), 'utf8');
      const vendored = readFileSync(
        path.join(__dirname, '..', '..', 'src', 'msp', 'msp.d.ts'),
        'utf8',
      );
      assert.equal(
        fresh,
        vendored,
        'msp.d.ts drifted from the installed CLI: re-export, re-pin CLI_VERSION/FINGERPRINT, and re-verify',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
