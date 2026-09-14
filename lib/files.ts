import { assert } from './errors';
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export function detectMedia(b: Buffer): string | undefined {
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString())) return 'image/gif';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  if (b.subarray(4, 8).toString() === 'ftyp') return 'video/mp4';
  if (b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) return 'video/webm';
}
export function validateMedia(b: Buffer) {
  assert(
    b.length > 0 && b.length <= MAX_FILE_SIZE,
    413,
    'FILE_TOO_LARGE',
    'File vuoto o superiore a 25 MiB.',
  );
  const type = detectMedia(b);
  assert(type, 415, 'UNSUPPORTED_MEDIA', 'Formato consentito: JPEG, PNG, GIF, WebP, MP4 o WebM.');
  return type;
}
export async function boundedBody(request: Request, max: number) {
  assert(
    Number(request.headers.get('content-length') ?? 0) <= max,
    413,
    'BODY_TOO_LARGE',
    'Richiesta troppo grande.',
  );
  const reader = request.body?.getReader();
  assert(reader, 400, 'EMPTY_BODY', 'Corpo della richiesta mancante.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      assert(false, 413, 'BODY_TOO_LARGE', 'Richiesta troppo grande.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
