type SignedUploadInput = {
  fileName: string;
  contentType?: string | null;
  folder?: string | null;
  productId?: string | null;
  productSlug?: string | null;
  moduleId?: string | null;
  moduleSlug?: string | null;
  relativePath?: string | null;
  mediaType?: 'audio' | 'image' | 'file' | 'video' | string | null;
};

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  publicUrl: string;
};

const REGION = 'auto';
const SERVICE = 's3';

function env(name: string) {
  return process.env[name] || '';
}

export function getR2Config(): R2Config {
  const accountId = env('R2_ACCOUNT_ID');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const bucket = env('R2_BUCKET') || 'hubfocoemcanto-media';
  const endpoint = (env('R2_ENDPOINT') || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')).replace(/\/$/, '');
  const publicUrl = (env('R2_PUBLIC_URL') || env('NEXT_PUBLIC_R2_PUBLIC_URL') || '').replace(/\/$/, '');

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !endpoint || !publicUrl) {
    throw new Error('R2 is not fully configured. Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT and R2_PUBLIC_URL.');
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint, publicUrl };
}

function cleanFileName(fileName: string) {
  const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';
  const base = fileName.replace(/\.[^/.]+$/, '');
  const safeBase = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'media';
  return extension ? `${safeBase}.${extension.toLowerCase().replace(/[^a-z0-9]/g, '')}` : safeBase;
}

export function cleanR2Segment(value?: string | null, fallback = 'item') {
  const clean = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return clean || fallback;
}

function cleanFolder(folder?: string | null) {
  const value = String(folder || 'uploads').trim();
  return value
    .split('/')
    .map((part) => part.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/') || 'uploads';
}

export function mediaTypeFolder(mediaType?: string | null, contentType?: string | null) {
  if (mediaType === 'audio' || contentType?.startsWith('audio/')) return 'audios';
  if (mediaType === 'image' || contentType?.startsWith('image/')) return 'images';
  return 'files';
}

function cleanRelativePath(relativePath?: string | null) {
  return String(relativePath || '')
    .split('/')
    .map((part) => cleanFileName(part))
    .filter(Boolean)
    .join('/');
}

export function createMediaKey(input: SignedUploadInput) {
  const { fileName, folder, contentType, productId, productSlug, moduleId, moduleSlug, relativePath, mediaType } = input;
  if (productId && moduleId) {
    const productPart = cleanR2Segment(productSlug || productId, 'product');
    const modulePart = cleanR2Segment(moduleSlug || moduleId, 'module');
    const typeFolder = mediaTypeFolder(mediaType, contentType);
    const path = cleanRelativePath(relativePath);
    const finalName = cleanFileName(fileName);
    return `products/${productPart}/modules/${modulePart}/${typeFolder}/${path ? `${path}/` : ''}${finalName}`;
  }
  const typeFolder = contentType?.startsWith('video/') ? 'videos' : contentType?.startsWith('audio/') ? 'audios' : contentType?.startsWith('image/') ? 'images' : 'files';
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${cleanFolder(folder || typeFolder)}/${yyyy}/${mm}/${id}-${cleanFileName(fileName)}`;
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function toDateStamp(date: Date) {
  return toAmzDate(date).slice(0, 8);
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bufferSource(value: ArrayBuffer | Uint8Array): BufferSource {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function hmac(key: ArrayBuffer | Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', bufferSource(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value));
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(secretAccessKey: string, dateStamp: string) {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

function encodeKey(key: string) {
  return key.split('/').map(encodeURIComponent).join('/');
}

export async function createR2SignedPutUrl(input: SignedUploadInput) {
  const config = getR2Config();
  const key = createMediaKey(input);
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = toDateStamp(now);
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const endpoint = new URL(config.endpoint);
  const host = endpoint.host;
  const expires = 15 * 60;
  const signedHeaders = 'host';
  const canonicalUri = `/${config.bucket}/${encodeKey(key)}`;

  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders,
  });

  const canonicalQueryString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = ['PUT', canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');
  const signingKey = await getSigningKey(config.secretAccessKey, dateStamp);
  const signature = hex(await hmac(signingKey, stringToSign));
  params.set('X-Amz-Signature', signature);

  return {
    key,
    uploadUrl: `${config.endpoint}${canonicalUri}?${params.toString()}`,
    publicUrl: `${config.publicUrl}/${encodeKey(key)}`,
    expiresIn: expires,
  };
}
