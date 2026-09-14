import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDiffLine } from '../../src/shared/diff';

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
