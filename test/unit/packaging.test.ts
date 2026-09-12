import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
});
