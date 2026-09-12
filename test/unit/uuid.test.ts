import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7 } from '../../src/msp/uuid';

describe('uuidv7', () => {
  it('emits version-7 variant-1 UUIDs', () => {
    for (let i = 0; i < 50; i++) {
      const id = uuidv7();
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('is monotonic within the same millisecond batch', () => {
    const now = Date.now();
    const a = uuidv7(now);
    const b = uuidv7(now + 1);
    assert.ok(a < b, `${a} should sort before ${b}`);
  });
});
