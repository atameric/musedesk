import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  contextPct,
  parseContextTriple,
  snapshotContextUsage,
} from '../../src/shared/contextUsage';
import type { SessionHistory } from '../../src/msp/msp';

// Hermetic: pure validation + math over plain objects.
describe('context usage triple', () => {
  it('accepts a complete notification frame', () => {
    assert.deepEqual(
      parseContextTriple({ usedTokens: 250000, windowTokens: 1000000, pressure: 'warning' }),
      { usedTokens: 250000, windowTokens: 1000000, pressure: 'warning' },
    );
  });

  it('treats a missing window as no-limit (never invents one)', () => {
    assert.deepEqual(parseContextTriple({ usedTokens: 10, pressure: 'normal' }), {
      usedTokens: 10,
      windowTokens: null,
      pressure: 'normal',
    });
    assert.equal(contextPct({ usedTokens: 10, windowTokens: null, pressure: 'normal' }), null);
  });

  it('rejects malformed triples', () => {
    assert.equal(parseContextTriple(null), null);
    assert.equal(parseContextTriple({}), null);
    assert.equal(parseContextTriple({ usedTokens: 'lots' }), null);
    assert.equal(parseContextTriple({ usedTokens: Number.NaN }), null);
    // A present-but-bogus window degrades to no-limit rather than failing.
    assert.deepEqual(parseContextTriple({ usedTokens: 5, windowTokens: -1 }), {
      usedTokens: 5,
      windowTokens: null,
      pressure: 'normal',
    });
  });

  it('computes a clamped whole percent', () => {
    assert.equal(contextPct({ usedTokens: 250000, windowTokens: 1000000, pressure: 'normal' }), 25);
    assert.equal(contextPct({ usedTokens: 999999, windowTokens: 1000000, pressure: 'normal' }), 100);
    assert.equal(contextPct({ usedTokens: 0, windowTokens: 1000000, pressure: 'normal' }), 0);
    assert.equal(contextPct({ usedTokens: 5, windowTokens: 0, pressure: 'normal' }), null);
  });

  it('adopts the snapshot block when served', () => {
    assert.deepEqual(
      snapshotContextUsage({
        mode: 'snapshot',
        snapshot: {
          state: { contextUsage: { usedTokens: 1, windowTokens: 4, pressure: 'normal' } },
        },
      } as SessionHistory),
      { usedTokens: 1, windowTokens: 4, pressure: 'normal' },
    );
    assert.equal(snapshotContextUsage({ mode: 'inline', items: [] } as SessionHistory), null);
    assert.equal(
      snapshotContextUsage({ mode: 'snapshot', snapshot: { state: {} } } as SessionHistory),
      null,
    );
  });
});
