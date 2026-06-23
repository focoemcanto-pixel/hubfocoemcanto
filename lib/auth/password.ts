const ITERATIONS = 32000;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

async function derive(password: string, salt: string) {
  let hash = await sha256Hex(`${salt}:${password}`);
  for (let index = 0; index < ITERATIONS; index += 1) hash = await sha256Hex(`${salt}:${hash}:${password}`);
  return hash;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function hashPassword(password: string) {
  const salt = randomSalt();
  const hash = await derive(password, salt);
  return `hub_sha256_v1$${ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored?: string | null) {
  if (!stored) return false;
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'hub_sha256_v1' || Number(iterations) !== ITERATIONS || !salt || !hash) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, hash);
}

export function isStrongEnough(password: string) {
  return password.length >= 6;
}
