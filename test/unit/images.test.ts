import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { imageFileToDraft, sniffMediaType } from '../../src/msp/images';
import { MAX_IMAGE_BYTES } from '../../src/shared/limits';

describe('image intake', () => {
  it('sniffs png/jpeg/gif/webp by magic bytes only', () => {
    assert.equal(
      sniffMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
      'image/png',
    );
    assert.equal(sniffMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
    assert.equal(sniffMediaType(Buffer.from('GIF89a', 'ascii')), 'image/gif');
    assert.equal(
      sniffMediaType(Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WEBP', 'ascii')])),
      'image/webp',
    );
    assert.equal(sniffMediaType(Buffer.from('not an image')), null);
    assert.equal(sniffMediaType(Buffer.alloc(0)), null);
  });

  it('stages valid files and rejects the rest with human messages', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'muse-img-'));
    try {
      const png = path.join(dir, 'shot.png');
      writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]));
      const draft = imageFileToDraft(png);
      assert.equal(draft.name, 'shot.png');
      assert.equal(draft.mediaType, 'image/png');
      assert.ok(draft.dataUrl.startsWith('data:image/png;base64,'));
      assert.ok(draft.id.length > 0);

      const txt = path.join(dir, 'notes.txt');
      writeFileSync(txt, 'hello');
      assert.throws(() => imageFileToDraft(txt), /not a supported image/);

      const empty = path.join(dir, 'empty.png');
      writeFileSync(empty, Buffer.alloc(0));
      assert.throws(() => imageFileToDraft(empty), /is empty/);

      const big = path.join(dir, 'big.png');
      writeFileSync(big, Buffer.alloc(MAX_IMAGE_BYTES + 1));
      assert.throws(() => imageFileToDraft(big), /10 MB or less/);

      assert.throws(() => imageFileToDraft(path.join(dir, 'missing.png')), /ENOENT/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
