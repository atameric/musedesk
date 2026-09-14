import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import config from '../../forge.config';

describe('packaging', () => {
  it('ships a single DMG maker with a distinct installer volume title', async () => {
    assert.equal(config.makers.length, 1);
    const maker = config.makers[0] as unknown as {
      name: string;
      config?: { title?: string };
      prepareConfig: (arch: string) => Promise<void>;
    };
    assert.equal(maker.name, 'dmg');
    // Same resolution Forge performs before make().
    await maker.prepareConfig('arm64');
    assert.equal(maker.config?.title, 'MuseDesk Installer');
  });

  it('marks the package output root as never-index so dev builds stay out of Spotlight', async () => {
    const hooks = config.hooks as unknown as {
      postPackage: (
        cfg: unknown,
        result: { platform: string; arch: string; outputPaths: string[] },
      ) => Promise<void>;
    };
    assert.equal(typeof hooks?.postPackage, 'function');
    const dir = mkdtempSync(path.join(tmpdir(), 'muse-spotlight-'));
    try {
      const appDir = path.join(dir, 'MuseDesk-darwin-arm64');
      mkdirSync(appDir, { recursive: true });
      await hooks.postPackage({}, { platform: 'darwin', arch: 'arm64', outputPaths: [appDir] });
      assert.equal(readFileSync(path.join(dir, '.metadata_never_index'), 'utf8'), '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
