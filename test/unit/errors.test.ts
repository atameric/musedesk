import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  humanizeError,
  infraTurnErrorGuidance,
  isInfraTurnError,
} from '../../src/shared/errors';

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

  it('maps client-side RPC timeouts to host-recovery guidance', () => {
    const timeout = new Error(
      "Error invoking remote method 'musedesk:turn/send': Error: MSP request turn/start timed out after 30000ms",
    );
    const msg = humanizeError(timeout);
    assert.ok(msg.includes('host stopped responding'));
    assert.ok(msg.includes('turn/start'));
    assert.ok(msg.includes('Restart host'));
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

describe('infra turn failures', () => {
  it('flags host-runtime failure classes only', () => {
    assert.equal(isInfraTurnError('configError'), true);
    assert.equal(isInfraTurnError('environmentError'), true);
    assert.equal(isInfraTurnError('launchError'), true);
    assert.equal(isInfraTurnError('modelError'), false);
    assert.equal(isInfraTurnError('stepLimit'), false);
    assert.equal(isInfraTurnError('somethingNew'), false);
  });

  it('guides infra failures toward a host restart', () => {
    const guidance = infraTurnErrorGuidance('configError');
    assert.ok(guidance && guidance.includes('Restart the host'));
    assert.equal(infraTurnErrorGuidance('modelError'), null);
  });
});
