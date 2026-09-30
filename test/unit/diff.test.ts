import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDiffLine, countDiffLines } from '../../src/shared/diff';

// Hermetic: pure line classification.
describe('diff line classification', () => {
  it('classifies unified diff lines', () => {
    assert.equal(classifyDiffLine('+++ b/a.ts'), 'hunk');
    assert.equal(classifyDiffLine('--- a/a.ts'), 'hunk');
    assert.equal(classifyDiffLine('@@ -1,2 +1,3 @@'), 'hunk');
    assert.equal(classifyDiffLine('+added'), 'add');
    assert.equal(classifyDiffLine('-removed'), 'del');
    assert.equal(classifyDiffLine(' context'), 'ctx');
    assert.equal(classifyDiffLine(''), 'ctx');
  });
});

describe('countDiffLines', () => {
  it('counts added/removed lines and skips headers', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,3 @@',
      ' ctx',
      '+one',
      '+two',
      '-gone',
      '',
    ].join('\n');
    assert.deepEqual(countDiffLines(diff), { add: 2, del: 1 });
  });

  it('returns zeros for empty diffs', () => {
    assert.deepEqual(countDiffLines(''), { add: 0, del: 0 });
  });
});
