const ITERATIONS = 120000;
const KEY_LENGTH = 32;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function derive(password: string, salt: Uint8Array) {
  const encoded = new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, KEY_LENGTH * 8);
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `pbkdf2_sha256$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored?: string | null) {
  if (!stored) return false;
  const [scheme, iterations, saltValue, hashValue] = stored.split('$');
  if (scheme !== 'pbkdf2_sha256' || Number(iterations) !== ITERATIONS || !saltValue || !hashValue) return false;
  const salt = base64ToBytes(saltValue);
  const expected = base64ToBytes(hashValue);
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}

export function isStrongEnough(password: string) {
  return password.length >= 6;
}
