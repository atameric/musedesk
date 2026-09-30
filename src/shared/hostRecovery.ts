import type { MuseDeskBridge } from './bridge';

/** Verify running state with the server; a dead host's cached turns cannot veto recovery. */
export async function assertHostRestartable(
  client: Pick<MuseDeskBridge, 'getStatus' | 'readSession'>,
  sessionIds: Iterable<string>,
): Promise<void> {
  const status = await client.getStatus();
  if (status.state === 'starting') throw new Error('The host is still starting.');
  if (status.state === 'error') return;
  try {
    for (const id of new Set(sessionIds)) {
      const read = await client.readSession(id, true);
      if (read.session.status === 'running' || read.session.activeTurnId) {
        throw new Error('Stop all running turns before restarting the host.');
      }
    }
  } catch (error) {
    // A metadata timeout/transport loss updates main's health before rejecting.
    if ((await client.getStatus()).state === 'error') return;
    throw error;
  }
}
