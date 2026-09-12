import { randomBytes } from 'node:crypto';

/** Minimal UUIDv7 for MSP idempotency handles (commandId). */
export function uuidv7(nowMs = Date.now()): string {
  const rand = randomBytes(10);
  const buf = Buffer.alloc(16);
  const t = BigInt(nowMs);
  buf.writeBigUInt64BE((t << 16n) | BigInt(rand.readUInt16BE(0) & 0x0fff), 0);
  rand.copy(buf, 8);
  buf[6] = (buf[6] & 0x0f) | 0x70;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = buf.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
