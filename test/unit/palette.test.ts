import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterCommands, type PaletteCommand } from '../../src/shared/palette';

// Hermetic: pure substring filter over plain objects.
describe('palette filter', () => {
  const noop = () => {};
  const commands: PaletteCommand[] = [
    { id: 's1', title: 'Go to Fix the login bug', detail: 'shop', run: noop },
    { id: 's2', title: 'Go to API refactor', detail: 'api', run: noop },
    { id: 'a1', title: 'Resync active session', run: noop },
  ];

  it('matches titles case-insensitively', () => {
    assert.deepEqual(
      filterCommands(commands, 'login').map((c) => c.id),
      ['s1'],
    );
    assert.deepEqual(
      filterCommands(commands, 'GO TO').map((c) => c.id),
      ['s1', 's2'],
    );
  });

  it('matches the detail line too', () => {
    assert.deepEqual(
      filterCommands(commands, 'shop').map((c) => c.id),
      ['s1'],
    );
  });

  it('returns everything on an empty query', () => {
    assert.equal(filterCommands(commands, '').length, 3);
    assert.equal(filterCommands(commands, '   ').length, 3);
  });
});
