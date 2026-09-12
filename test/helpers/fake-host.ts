import path from 'node:path';
import { MspHost } from '../../src/msp/host';
import { PINNED_FINGERPRINT } from '../../src/msp/pinned';

export const fakeServePath = path.join(__dirname, '..', 'helpers', 'fake-serve.mjs');

/** Connect a client to the deterministic fake host for one scenario. */
export async function openFakeScenario(clientName: string, scenario: string): Promise<MspHost> {
  process.env.MSP_FAKE_FINGERPRINT = PINNED_FINGERPRINT;
  const host = new MspHost(process.execPath, clientName, '0.0.0-test', [], [fakeServePath, scenario]);
  const init = await host.connect();
  if (init.schema.fingerprint !== PINNED_FINGERPRINT) {
    await host.close();
    throw new Error('fake host fingerprint mismatch');
  }
  return host;
}
