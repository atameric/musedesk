import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { humanizeError } from '../../src/shared/errors';

const IN_USE =
  "Error invoking remote method 'musedesk:session/resume': Error: MSP " +
  '{"code":-32021,"message":"session abc is already in use",' +
  '"data":{"kind":"sessionInUse","retryable":false,"sessionId":"abc"}}';

describe('humanizeError', () => {
  it('maps sessionInUse to an actionable sentence', () => {
    assert.equal(
      humanizeError(new Error(IN_USE)),
      'This session is already open in another window (e.g. the terminal). Pick another session or start a new chat.',
    );
  });

  it('salvages the kind from truncated MSP payloads', () => {
    assert.ok(humanizeError(new Error(IN_USE.slice(0, 160))).includes('already open in another window'));
  });

  it('maps other known races without the IPC prefix', () => {
    const stale = new Error(
      "Error invoking remote method 'musedesk:approval/decide': Error: MSP " +
        '{"code":-32053,"message":"stale","data":{"kind":"approvalRequirementStale"}}',
    );
    assert.equal(humanizeError(stale), 'That approval already moved to a new step. Refresh and decide again.');
    const gone = new Error('MSP {"code":-32020,"message":"gone","data":{"kind":"sessionNotFound"}}');
    assert.equal(humanizeError(gone), 'That session no longer exists. Pick another session or start a new chat.');
  });

  it('passes unknown shapes through with the prefix stripped', () => {
    assert.equal(
      humanizeError(new Error("Error invoking remote method 'musedesk:x': Error: boom")),
      'boom',
    );
    assert.equal(humanizeError(new Error('plain failure')), 'plain failure');
    assert.equal(humanizeError('string failure'), 'string failure');
    const exotic = new Error('MSP {"code":-32603,"message":"weird","data":{"kind":"weirdKind"}}');
    assert.equal(humanizeError(exotic), 'weirdKind: weird');
  });
});
