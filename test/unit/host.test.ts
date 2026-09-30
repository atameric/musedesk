import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MspHost } from '../../src/msp/host';
import { fakeServePath } from '../helpers/fake-host';

function transportHost() {
  return new MspHost(process.execPath, 'transport-test', '0.0.0', [], [fakeServePath, 'transport'], 500);
}

describe('MSP transport health', () => {
  it('reports a silent host and recovers when a heartbeat receives a response', async () => {
    const host = transportHost();
    const health: Array<string | null> = [];
    host.onHealthChange((error) => health.push(error?.message ?? null));
    try {
      await host.connect();
      await assert.rejects(host.request('test/silent'), /timed out/);
      assert.match(host.error!.message, /timed out/);
      assert.equal(host.connected, true); // process alive, command plane unresponsive
      await host.request('session/list', { limit: 1 });
      assert.equal(host.error, null);
      assert.equal(health.at(-1), null);
    } finally { await host.close(); }
  });

  it('reports process loss and rejects outstanding requests immediately', async () => {
    const host = transportHost();
    let failed = false;
    host.onHealthChange((error) => { if (error) failed = true; });
    try {
      await host.connect();
      const pending = assert.rejects(host.request('test/silent'), /closed|exited/);
      const exit = assert.rejects(host.request('test/exit'), /closed|exited/);
      await Promise.all([pending, exit]);
      assert.equal(host.connected, false);
      assert.equal(failed, true);
      await assert.rejects(host.request('session/list'), /closed|exited/);
    } finally { await host.close(); }
  });

  it('close rejects in-flight requests and does not wait for their timeout', async () => {
    const host = transportHost();
    await host.connect();
    const pending = assert.rejects(host.request('test/silent'), /closed/);
    await host.close();
    await pending;
    assert.equal(host.connected, false);
  });

  it('preserves Turkish text and emoji across fragmented UTF-8 writes', async () => {
    const host = transportHost();
    try {
      await host.connect();
      assert.equal(await host.request('test/utf8'), 'çalışıyor 🎵');
    } finally { await host.close(); }
  });
});
