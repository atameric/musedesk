import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClock,
  formatDuration,
  groupChatRows,
  rowTurnId,
  turnAgentText,
} from '../../src/shared/turnMeta';
import type { FoldedItem } from '../../src/msp/transcript';

function item(over: Partial<FoldedItem> & { itemId: string }): FoldedItem {
  return {
    kind: 'agentMessage',
    status: 'completed',
    turnId: 't1',
    revision: 0,
    text: '',
    summary: [],
    outputText: '',
    retracted: false,
    terminal: true,
    ...over,
  };
}

describe('groupChatRows', () => {
  it('groups consecutive same-turn tool calls into one run', () => {
    const rows = groupChatRows([
      item({ itemId: 'a', kind: 'toolCall' }),
      item({ itemId: 'b', kind: 'toolCall' }),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'tools');
    assert.equal(rowTurnId(rows[0]), 't1');
  });

  it('splits tool runs across turns and non-tool rows', () => {
    const rows = groupChatRows([
      item({ itemId: 'a', kind: 'toolCall', turnId: 't1' }),
      item({ itemId: 'b', kind: 'agentMessage', turnId: 't1' }),
      item({ itemId: 'c', kind: 'toolCall', turnId: 't1' }),
      item({ itemId: 'd', kind: 'toolCall', turnId: 't2' }),
    ]);
    assert.deepEqual(
      rows.map((r) => r.type),
      ['tools', 'agent', 'tools', 'tools'],
    );
  });

  it('groups consecutive same-turn agent messages into one block', () => {
    const rows = groupChatRows([
      item({ itemId: 'a', kind: 'agentMessage', text: 'one' }),
      item({ itemId: 'b', kind: 'agentMessage', text: 'two' }),
      item({ itemId: 'c', kind: 'userMessage', text: 'q' }),
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].type, 'agent');
    assert.equal(rows[1].type, 'single');
  });

  it('leaves other kinds as single rows', () => {
    const rows = groupChatRows([
      item({ itemId: 'a', kind: 'userMessage', text: 'hi' }),
      item({ itemId: 'b', kind: 'reasoning' }),
    ]);
    assert.deepEqual(
      rows.map((r) => r.type),
      ['single', 'single'],
    );
  });
});

describe('formatClock', () => {
  it('renders a zero-padded HH:MM label', () => {
    assert.match(formatClock(new Date(2026, 4, 1, 9, 7).getTime()), /^\d\d:\d\d$/);
  });
});

describe('formatDuration', () => {
  it('compacts seconds and minutes', () => {
    assert.equal(formatDuration(5), '5s');
    assert.equal(formatDuration(60), '1m');
    assert.equal(formatDuration(125), '2m 5s');
  });
});

describe('turnAgentText', () => {
  it('joins non-empty agent texts of one turn only', () => {
    const text = turnAgentText(
      [
        item({ itemId: 'a', kind: 'agentMessage', text: 'one', turnId: 't1' }),
        item({ itemId: 'b', kind: 'agentMessage', text: '', turnId: 't1' }),
        item({ itemId: 'c', kind: 'toolCall', text: 'x', turnId: 't1' }),
        item({ itemId: 'd', kind: 'agentMessage', text: 'other', turnId: 't2' }),
        item({ itemId: 'e', kind: 'agentMessage', text: 'two', turnId: 't1' }),
      ],
      't1',
    );
    assert.equal(text, 'one\n\ntwo');
  });
});
