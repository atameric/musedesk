import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverMusePath, getMuseVersion, resolveViaLoginShell } from '../../src/msp/discovery';

// Hermetic: every case uses stub executables under a temp dir, so the
// machine's real `muse` install (or lack of one) cannot affect results.
describe('muse discovery', () => {
  let dir = '';
  let stubBin = '';
  let fakeShell = '';

  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'muse-disc-'));
    stubBin = path.join(dir, 'muse');
    writeFileSync(stubBin, '#!/bin/sh\necho "Muse Code 9.9.9 (stub)"\n');
    chmodSync(stubBin, 0o755);
    fakeShell = path.join(dir, 'fakeshell');
    writeFileSync(fakeShell, `#!/bin/sh\necho ${stubBin}\n`);
    chmodSync(fakeShell, 0o755);
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds muse on the given PATH and reads its version', () => {
    assert.equal(discoverMusePath(dir), stubBin);
    assert.equal(getMuseVersion(stubBin), 'Muse Code 9.9.9 (stub)');
  });

  it('resolves via the login shell when PATH misses, validating executability', () => {
    assert.equal(resolveViaLoginShell(fakeShell), stubBin);
    const lyingShell = path.join(dir, 'lyingshell');
    writeFileSync(lyingShell, '#!/bin/sh\necho "/does/not/exist"\n');
    chmodSync(lyingShell, 0o755);
    assert.equal(resolveViaLoginShell(lyingShell), null);
    const failingShell = path.join(dir, 'failshell');
    writeFileSync(failingShell, '#!/bin/sh\nexit 1\n');
    chmodSync(failingShell, 0o755);
    assert.equal(resolveViaLoginShell(failingShell), null);
  });

  it('prefers the first PATH entry that holds an executable muse', () => {
    const dir2 = mkdtempSync(path.join(tmpdir(), 'muse-disc2-'));
    try {
      const stub2 = path.join(dir2, 'muse');
      writeFileSync(stub2, '#!/bin/sh\necho stub2\n');
      chmodSync(stub2, 0o755);
      assert.equal(discoverMusePath(`${dir2}${path.delimiter}${dir}`), stub2);
      assert.equal(discoverMusePath(`${dir}${path.delimiter}${dir2}`), stubBin);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});
