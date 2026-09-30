import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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

  it('keeps dev builds out of Spotlight via a .noindex output root', () => {
    assert.equal(config.outDir, 'out.noindex');
  });

  it('ships the Spotlight marker asset staged into the installer volume', () => {
    assert.equal(existsSync(path.resolve(__dirname, '../../assets/dmg/.metadata_never_index')), true);
  });
});
