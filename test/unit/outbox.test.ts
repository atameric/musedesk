import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addQueuedTurn,
  classifySendOutcome,
  takeQueuedTurn,
  type QueuedTurn,
} from '../../src/shared/outbox';

// Hermetic: pure ack classification + queued-list ops over plain objects.
describe('classifySendOutcome', () => {
  it('passes the known dispositions through', () => {
    assert.equal(classifySendOutcome('started'), 'started');
    assert.equal(classifySendOutcome('queued'), 'queued');
    assert.equal(classifySendOutcome('steered'), 'steered');
  });

  it('fails safe on anything unrecognized', () => {
    for (const d of ['bogus', '', 'STARTED', ' queued']) {
      assert.equal(classifySendOutcome(d), 'unknown');
    }
    assert.equal(classifySendOutcome(undefined as unknown as 'started'), 'unknown');
    assert.equal(classifySendOutcome(null as unknown as 'started'), 'unknown');
  });
});

describe('queued turns', () => {
  const q = (turnId: string, text = 'hi'): QueuedTurn => ({ turnId, commandId: `cmd-${turnId}`, text, shotCount: 0 });

  it('appends new submits and replaces by turnId', () => {
    let list = addQueuedTurn([], q('t1'));
    list = addQueuedTurn(list, q('t2'));
    assert.deepEqual(
      list.map((e) => e.turnId),
      ['t1', 't2'],
    );
    list = addQueuedTurn(list, q('t1', 'edited'));
    assert.deepEqual(
      list.map((e) => e.turnId),
      ['t2', 't1'],
    );
    assert.equal(
      list.find((e) => e.turnId === 't1')?.text,
      'edited',
    );
  });

  it('takes a tracked submit and no-ops on unknown ids', () => {
    const list = [q('t1'), q('t2')];
    const taken = takeQueuedTurn(list, 't1');
    assert.deepEqual(
      taken.list.map((e) => e.turnId),
      ['t2'],
    );
    assert.equal(taken.removed?.turnId, 't1');
    const missed = takeQueuedTurn(taken.list, 'nope');
    assert.equal(missed.removed, null);
    assert.deepEqual(
      missed.list.map((e) => e.turnId),
      ['t2'],
    );
  });
});
