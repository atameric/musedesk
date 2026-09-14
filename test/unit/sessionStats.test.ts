import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTokens,
  parseTokenUsage,
  parseTodoList,
  snapshotTokenUsage,
  snapshotTodoList,
} from '../../src/shared/sessionStats';
import type { SessionHistory } from '../../src/msp/msp';

// Hermetic: pure validation + math over plain objects.
describe('token usage', () => {
  it('takes the cumulative block from a tokenUsage frame', () => {
    assert.deepEqual(
      parseTokenUsage({
        cumulative: { promptTokens: 100, outputTokens: 50, totalTokens: 150 },
        promptTokens: 10,
        totalTokens: 15,
      }),
      { promptTokens: 100, outputTokens: 50, totalTokens: 150 },
    );
  });

  it('rejects malformed frames', () => {
    assert.equal(parseTokenUsage(null), null);
    assert.equal(parseTokenUsage({}), null);
    assert.equal(parseTokenUsage({ cumulative: { promptTokens: 1 } }), null);
    assert.equal(
      parseTokenUsage({ cumulative: { promptTokens: 1, outputTokens: 2, totalTokens: 'x' } }),
      null,
    );
  });

  it('adopts the snapshot cumulative block when served', () => {
    const history = {
      mode: 'snapshot',
      snapshot: { state: { tokenUsage: { promptTokens: 1, outputTokens: 2, totalTokens: 3 } } },
    } as SessionHistory;
    assert.deepEqual(snapshotTokenUsage(history), { promptTokens: 1, outputTokens: 2, totalTokens: 3 });
    assert.equal(snapshotTokenUsage({ mode: 'inline', items: [] } as SessionHistory), null);
  });

  it('formats token counts compactly', () => {
    assert.equal(formatTokens(0), '0');
    assert.equal(formatTokens(999), '999');
    assert.equal(formatTokens(245300), '245K');
    assert.equal(formatTokens(1200000), '1.2M');
    assert.equal(formatTokens(3000000), '3M');
  });
});

describe('todo list', () => {
  it('replaces the whole list per event', () => {
    assert.deepEqual(
      parseTodoList({
        items: [
          { text: 'Write code', status: 'inProgress', activeForm: 'Writing code' },
          { text: 'Test', status: 'pending' },
        ],
      }),
      [
        { text: 'Write code', status: 'inProgress', activeForm: 'Writing code' },
        { text: 'Test', status: 'pending' },
      ],
    );
  });

  it('treats an empty list as cleared, not malformed', () => {
    assert.deepEqual(parseTodoList({ items: [] }), []);
    assert.equal(parseTodoList({}), null);
    assert.equal(parseTodoList({ items: [{ status: 'pending' }] }), null);
  });

  it('adopts the snapshot todo block when served', () => {
    const history = {
      mode: 'snapshot',
      snapshot: { state: { todoList: { items: [{ text: 'A', status: 'completed' }] } } },
    } as SessionHistory;
    assert.deepEqual(snapshotTodoList(history), [{ text: 'A', status: 'completed' }]);
    assert.equal(snapshotTodoList({ mode: 'inline', items: [] } as SessionHistory), null);
    assert.equal(
      snapshotTodoList({ mode: 'snapshot', snapshot: { state: {} } } as SessionHistory),
      null,
    );
  });
});
