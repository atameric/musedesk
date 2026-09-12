import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PINNED_CLI_VERSION, PINNED_FINGERPRINT } from '../../src/msp/pinned';

const mspDir = path.join(__dirname, '..', '..', 'src', 'msp');

describe('pinned MSP expectations', () => {
  it('bundled consts match the .txt sources of truth', () => {
    const cli = readFileSync(path.join(mspDir, 'CLI_VERSION.txt'), 'utf8').trim();
    const fp = readFileSync(path.join(mspDir, 'FINGERPRINT.txt'), 'utf8').trim();
    assert.equal(PINNED_CLI_VERSION, cli);
    assert.equal(PINNED_FINGERPRINT, fp);
  });

  it('fingerprint looks like a sha256 envelope fingerprint', () => {
    assert.match(PINNED_FINGERPRINT, /^sha256:[0-9a-f]{64}$/);
  });
});
