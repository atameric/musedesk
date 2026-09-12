import { statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { uuidv7 } from './uuid';
import { MAX_IMAGE_BYTES } from '../shared/limits';

export interface PickedImage {
  id: string;
  name: string;
  sizeBytes: number;
  mediaType: string;
  dataUrl: string;
}

/** Detect image type from magic bytes (never trust the extension). */
export function sniffMediaType(buf: Buffer): string | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return 'image/gif';
  }
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Validate + stage one picked file for sending (throws with a human message). */
export function imageFileToDraft(filePath: string): PickedImage {
  const name = path.basename(filePath);
  const st = statSync(filePath);
  if (!st.isFile()) throw new Error(`"${name}" is not a file.`);
  if (st.size === 0) throw new Error(`"${name}" is empty.`);
  if (st.size > MAX_IMAGE_BYTES) {
    throw new Error(`"${name}" is ${(st.size / 1048576).toFixed(1)} MB — images must be 10 MB or less.`);
  }
  const buf = readFileSync(filePath);
  const mediaType = sniffMediaType(buf);
  if (!mediaType) throw new Error(`"${name}" is not a supported image (png, jpeg, gif, or webp).`);
  return {
    id: uuidv7(),
    name,
    sizeBytes: st.size,
    mediaType,
    dataUrl: `data:${mediaType};base64,${buf.toString('base64')}`,
  };
}
