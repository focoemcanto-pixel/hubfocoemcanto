export function cloudflareStreamSource(uid?: string | null) {
  const value = String(uid || '').trim();
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const host = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN || 'videodelivery.net';
  return `https://${host}/${value}/manifest/video.m3u8`;
}

export function cloudflareStreamEmbed(uid?: string | null) {
  const value = String(uid || '').trim();
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const host = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN || 'videodelivery.net';
  return `https://${host}/${value}/iframe`;
}
