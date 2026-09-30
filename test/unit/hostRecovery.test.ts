import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertHostRestartable } from '../../src/shared/hostRecovery';
import type { HostStatus } from '../../src/shared/bridge';
import type { SessionReadResult } from '../../src/msp/msp';

function clientFor(state: HostStatus['state'], running = false) {
  return {
    getStatus: async () => ({ state } as HostStatus),
    readSession: async () => ({ session: { status: running ? 'running' : 'idle', activeTurnId: null } } as SessionReadResult),
  };
}

describe('host restart safety', () => {
  it('allows recovery of an offline host despite stale running-session ids', async () => {
    const client = clientFor('error', true);
    client.readSession = async () => { throw new Error('must not ask a dead host'); };
    await assertHostRestartable(client, ['ghost-turn']);
  });

  it('rechecks cached running sessions and allows restart when the server says idle', async () => {
    await assertHostRestartable(clientFor('ready'), ['stale-session']);
  });

  it('blocks restart while the healthy host reports a running turn', async () => {
    await assert.rejects(assertHostRestartable(clientFor('ready', true), ['running-session']), /Stop all running/);
  });

  it('allows recovery when metadata read discovers an unresponsive host', async () => {
    let unhealthy = false;
    const client = clientFor('ready');
    client.getStatus = async () => ({ state: unhealthy ? 'error' : 'ready' } as HostStatus);
    client.readSession = async () => { unhealthy = true; throw new Error('timed out'); };
    await assertHostRestartable(client, ['ghost-turn']);
  });
});
