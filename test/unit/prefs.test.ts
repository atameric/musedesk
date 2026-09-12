import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadPrefs, savePrefs, serveArgsFor } from '../../src/main/prefs';

describe('host prefs', () => {
  it('maps full access to the serve flag', () => {
    assert.deepEqual(serveArgsFor(true), ['--disable-sandbox']);
    assert.deepEqual(serveArgsFor(false), []);
  });

  it('round-trips prefs and defaults on missing/corrupt files', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'musedesk-prefs-'));
    try {
      assert.deepEqual(loadPrefs(dir), { fullAccess: false });
      savePrefs(dir, { fullAccess: true });
      assert.deepEqual(loadPrefs(dir), { fullAccess: true });
      writeFileSync(path.join(dir, 'musedesk-prefs.json'), '{nope');
      assert.deepEqual(loadPrefs(dir), { fullAccess: false });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
