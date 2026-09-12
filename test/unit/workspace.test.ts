import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dialogPathFor } from '../../src/main/workspace';

describe('dialogPathFor', () => {
  it('passes a usable defaultPath through', () => {
    assert.equal(dialogPathFor('/Users/a/Developer'), '/Users/a/Developer');
  });

  it('drops anything that is not a non-empty string', () => {
    assert.equal(dialogPathFor(undefined), undefined);
    assert.equal(dialogPathFor(null), undefined);
    assert.equal(dialogPathFor(''), undefined);
    assert.equal(dialogPathFor(123), undefined);
    assert.equal(dialogPathFor({}), undefined);
    assert.equal(dialogPathFor(['x']), undefined);
  });
});
